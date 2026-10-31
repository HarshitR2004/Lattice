from copy import deepcopy
from uuid import uuid4

import pytest


def workflow(handling="flag"):
    def field(id, name, type="text", **patch):
        return {"id": id, "name": name, "type": type, "unit": "", "required": True,
                "options": "", "min": "", "max": "", "handling": "record", **patch}
    return {"id": str(uuid4()), "title": "Incoming Component Inspection", "description": "", "reference": "WI-012",
            "procedure": "Inspect the label and measure the diameter.", "setup": [field("batch", "Batch number")],
            "steps": [{"id": "identify", "title": "Identify the component", "instructions": "Read its label.",
                       "fields": [field("component", "Component ID")]},
                      {"id": "condition", "title": "Inspect its condition", "instructions": "Look for damage.",
                       "fields": [field("condition-field", "Condition", "choice", options="No visible damage\nDamage found")]},
                      {"id": "diameter", "title": "Measure its diameter", "instructions": "Use a caliper.",
                       "fields": [field("diameter-field", "Diameter", "number", unit="mm", min="9.95",
                                        max="10.05", handling=handling)]},
                      {"id": "notes", "title": "Record observations", "instructions": "Record any notes.",
                       "fields": [field("notes-field", "Observations", required=False)]}]}


async def setup(client, handling="flag"):
    response = await client.post("workflows", json=workflow(handling))
    assert response.status_code == 201, response.text
    w = response.json()
    response = await client.post(f"workflows/{w['id']}/publish", json={"revision": w["revision"]})
    assert response.status_code == 200, response.text
    w = response.json()
    response = await client.post("sessions", json={"workflowId": w["id"], "label": "Batch B-104"})
    assert response.status_code == 201, response.text
    return w, response.json()


async def act(client, state, type, expected=200, **values):
    response = await client.post(f"sessions/{state['id']}/actions", json={
        "type": type, "revision": state["revision"], "requestId": str(uuid4()), **values})
    assert response.status_code == expected, response.text
    return response.json()


async def record(client, state, field_id, value):
    state = await act(client, state, "draft", fieldId=field_id, value=value)
    return await act(client, state, "record")


async def to_measurement(client, state):
    for fid, value in [("batch", "B-104"), ("component", "CMP-014"), ("condition-field", "No visible damage")]:
        state = await record(client, state, fid, value)
        state = await act(client, state, "next")
    return state


async def test_complete_persistent_inspection_corrections_exports_and_archive(client):
    w, state = await setup(client)
    state = await to_measurement(client, state)
    state = await record(client, state, "diameter-field", "10.08")
    assert state["responses"]["diameter-field"]["kind"] == "flagged"
    state = await act(client, state, "go", position=1)
    state = await record(client, state, "component", "CMP-015")
    assert state["responses"]["component"]["history"][0]["value"] == "CMP-014"
    state = await act(client, state, "pause")
    await act(client, state, "record", expected=409)
    # Reload through an independent request and database session.
    state = (await client.get(f"sessions/{state['id']}")).json()
    assert state["status"] == "paused"
    state = await act(client, state, "resume")
    state = await act(client, state, "go", position=4)
    state = await act(client, state, "record")
    state = await act(client, state, "finish")
    assert state["status"] == "completed"
    await act(client, state, "draft", fieldId="component", value="changed", expected=409)
    exported = await client.get(f"sessions/{state['id']}/export")
    assert exported.json()["reviewStatus"] == "Awaiting human review"
    assert exported.json()["events"]
    assert "attachment" in exported.headers["content-disposition"]
    assert (await client.delete(f"workflows/{w['id']}?revision={w['revision']}")).status_code == 204
    assert (await client.get(f"sessions/{state['id']}")).json()["workflow"]["title"] == w["title"]


@pytest.mark.parametrize("value,kind", [("9.95", "recorded"), ("10.05", "recorded"),
                                       ("9.949999", "flagged"), ("10.050001", "flagged"),
                                       ("NaN", "blocked"), ("Infinity", "blocked")])
async def test_decimal_boundaries_and_nonfinite(client, value, kind):
    _, state = await setup(client)
    state = await to_measurement(client, state)
    state = await record(client, state, "diameter-field", value)
    assert state["responses"]["diameter-field"]["kind"] == kind


async def test_required_fields_choices_resolve_and_draft_gates(client):
    _, state = await setup(client, "resolve")
    await act(client, state, "next", expected=409)
    await act(client, state, "go", position=3, expected=409)
    await act(client, state, "finish", expected=409)
    state = await to_measurement(client, state)
    state = await record(client, state, "diameter-field", "10.08")
    await act(client, state, "next", expected=409)
    state = await record(client, state, "diameter-field", "10.02")
    assert state["responses"]["diameter-field"]["history"][0]["kind"] == "blocked"
    state = await act(client, state, "draft", fieldId="diameter-field", value="10.01")
    await act(client, state, "next", expected=409)
    state = await act(client, state, "go", position=2)
    state = await record(client, state, "condition-field", "Unconfigured response")
    assert state["responses"]["condition-field"]["kind"] == "blocked"


async def test_version_snapshots_and_optimistic_concurrency(client):
    w, state = await setup(client)
    content = {k: w[k] for k in workflow() if k != "id"}
    content["steps"][2]["fields"][0]["max"] = "20"
    payload = {"revision": w["revision"], "content": content}
    changed = (await client.put(f"workflows/{w['id']}", json=payload)).json()
    assert changed["status"] == "draft"
    assert (await client.put(f"workflows/{w['id']}", json=payload)).status_code == 409
    assert (await client.post("sessions", json={"workflowId": w["id"]})).status_code == 409
    new = (await client.post(f"workflows/{w['id']}/publish", json={"revision": changed["revision"]})).json()
    assert new["version"] == 2
    snapshot = (await client.get(f"sessions/{state['id']}")).json()["workflow"]
    assert snapshot["version"] == 1 and snapshot["steps"][2]["fields"][0]["max"] == "10.05"


async def test_commands_are_idempotent_and_reject_reused_ids(client):
    _, state = await setup(client)
    body = {"type": "draft", "fieldId": "batch", "value": "B-104", "requestId": str(uuid4()),
            "revision": state["revision"]}
    first = await client.post(f"sessions/{state['id']}/actions", json=body)
    again = await client.post(f"sessions/{state['id']}/actions", json=body)
    assert first.json() == again.json()
    body["value"] = "B-105"
    assert (await client.post(f"sessions/{state['id']}/actions", json=body)).status_code == 409
    await act(client, state, "record", expected=409)


async def test_import_is_repeat_safe_and_does_not_overwrite(client):
    item = workflow()
    item.update(status="ready", version=1, published={**deepcopy(item), "version": 1})
    assert (await client.post("workflows/import", json={"workflows": [item]})).json()["imported"] == [item["id"]]
    item["title"] = "Overwrite attempt"
    assert (await client.post("workflows/import", json={"workflows": [item]})).json()["skipped"] == [item["id"]]
    assert (await client.get(f"workflows/{item['id']}" )).json()["title"] != "Overwrite attempt"
    exported = await client.get(f"workflows/{item['id']}/export")
    assert exported.json()["published"]["version"] == 1


async def test_publication_validation(client):
    item = workflow()
    item["title"] = ""
    w = (await client.post("workflows", json=item)).json()
    assert (await client.post(f"workflows/{w['id']}/publish", json={"revision": 1})).status_code == 422
    item = workflow()
    item["steps"][2]["fields"][0]["min"] = "11"
    assert (await client.post("workflows", json=item)).status_code == 422
    assert (await client.get("health/ready")).status_code == 200
