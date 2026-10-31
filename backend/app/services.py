from copy import deepcopy
import hashlib
import json

from sqlalchemy import select

from . import repositories as repo
from .domain import fail, now, transition, validate_content
from .models import ResponseRevision, SessionEvent, SessionRow, WorkflowRow, WorkflowVersion
from .schemas import WorkflowContent, uid


async def workflow_dto(db, row):
    result = {**row.content, "id": row.id, "revision": row.revision, "version": row.version,
              "status": row.status, "updatedAt": row.updated_at}
    version = await repo.published(db, row)
    if version:
        result["published"] = {**version.content, "version": version.number}
    return result


async def create_workflow(db, data):
    if await db.get(WorkflowRow, data.id):
        fail("A workflow with this ID already exists.")
    content = WorkflowContent.model_validate(data).model_dump()
    validate_content(content)
    row = WorkflowRow(id=data.id, content=content, updated_at=now(), revision=1, version=0,
                      status="draft", archived=False)
    db.add(row)
    await db.flush()
    return await workflow_dto(db, row)


async def update_workflow(db, key, data):
    await repo.require(db, WorkflowRow, key)
    content = data.content.model_dump()
    validate_content(content)
    await repo.compare_update(db, WorkflowRow, key, data.revision,
                              {"content": content, "status": "draft", "updated_at": now()})
    return await workflow_dto(db, await repo.require(db, WorkflowRow, key))


async def publish_workflow(db, key, revision):
    row = await repo.require(db, WorkflowRow, key)
    if row.revision != revision:
        fail("Workflow changed. Refresh before publishing.")
    if row.status == "ready":
        return await workflow_dto(db, row)
    validate_content(row.content, publish=True)
    content, number = deepcopy(row.content), row.version + 1
    await repo.compare_update(db, WorkflowRow, key, revision,
                              {"version": number, "status": "ready", "updated_at": now()})
    db.add(WorkflowVersion(id=uid(), workflow_id=key, number=number, content=content))
    await db.flush()
    return await workflow_dto(db, await repo.require(db, WorkflowRow, key))


async def import_workflows(db, request):
    imported, skipped = [], []
    for item in request.workflows:
        if await db.get(WorkflowRow, item.id):
            skipped.append(item.id)
            continue
        await create_workflow(db, item)
        if item.published:
            content = WorkflowContent.model_validate(item.published).model_dump()
            validate_content(content, publish=True)
            number = item.published.get("version", item.version)
            if not isinstance(number, int) or number < 1:
                fail("Published version must be a positive integer.", 422)
            row = await repo.require(db, WorkflowRow, item.id)
            row.version = number
            # Ready imports must match their published content; otherwise retain them as drafts.
            row.status = "ready" if item.status == "ready" and row.content == content else "draft"
            db.add(WorkflowVersion(id=uid(), workflow_id=item.id, number=number, content=content))
        imported.append(item.id)
    await db.flush()
    return {"imported": imported, "skipped": skipped}


def session_dto(row):
    return {**deepcopy(row.state), "revision": row.revision}


async def start_session(db, request):
    # Request UUID is the new session's ID, making retries safe across reconnects.
    existing = await db.get(SessionRow, request.requestId)
    if existing:
        if existing.state["workflowId"] != request.workflowId or existing.state["label"] != (
                request.label.strip() or existing.state["workflow"]["title"]):
            fail("This request ID was already used for a different session.")
        return session_dto(existing)
    workflow = await repo.require(db, WorkflowRow, request.workflowId)
    version = await repo.published(db, workflow)
    if workflow.status != "ready" or version is None:
        fail("Mark this workflow ready before starting a session.")
    stamp = now()
    state = {"id": request.requestId, "workflowId": workflow.id,
             "workflow": {**deepcopy(version.content), "version": version.number},
             "label": request.label.strip() or version.content["title"], "status": "active", "position": 0,
             "createdAt": stamp, "updatedAt": stamp, "drafts": {}, "sources": {}, "responses": {},
             "completedSteps": [], "attemptedSteps": []}
    row = SessionRow(id=request.requestId, version_id=version.id, revision=1, state=state)
    db.add(row)
    await db.flush()
    return session_dto(row)


async def apply_command(db, key, command, source="typed"):
    payload = command.model_dump() if hasattr(command, "model_dump") else command
    fingerprint = hashlib.sha256(json.dumps({**payload, "source": source}, sort_keys=True).encode()).hexdigest()
    previous = await repo.receipt(db, key, payload["requestId"])
    if previous:
        if previous.fingerprint != fingerprint:
            fail("This command ID was already used for another action.")
        return previous.result
    row = await repo.require(db, SessionRow, key)
    if row.revision != payload["revision"]:
        fail("Session changed. Refresh before trying again.")
    original = deepcopy(row.state)
    state = transition(original, payload, source)
    revision = row.revision
    await repo.compare_update(db, SessionRow, key, revision, {"state": state})
    result = {**state, "revision": revision + 1}
    if payload["type"] == "record":
        for field_id, response in state["responses"].items():
            if response != original["responses"].get(field_id):
                db.add(ResponseRevision(id=uid(), session_id=key, field_id=field_id,
                                        response={k: v for k, v in response.items() if k != "history"}))
    db.add(SessionEvent(id=uid(), session_id=key, request_id=payload["requestId"], fingerprint=fingerprint,
                         at=now(), action={**payload, "source": source}, result=result))
    if payload["type"] in ("pause", "finish"):
        await repo.end_voice_runs(db, key)
    await db.flush()
    return result


async def audit_events(db, key):
    await repo.require(db, SessionRow, key)
    rows = (await db.scalars(select(SessionEvent).where(SessionEvent.session_id == key)
                             .order_by(SessionEvent.at))).all()
    return [{"id": r.id, "at": r.at, "action": r.action} for r in rows]
