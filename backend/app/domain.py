from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fail(message, status=409):
    raise HTTPException(status, message)


def number(value):
    try:
        result = Decimal(value)
    except (InvalidOperation, ValueError):
        fail("Enter a valid finite measurement.", 422)
    if not result.is_finite():
        fail("Enter a valid finite measurement.", 422)
    return result


def validate_content(content, publish=False):
    ids = set()
    for step in content["steps"]:
        if step["id"] == "setup" or step["id"] in ids:
            fail("Step identifiers must be unique and cannot be setup.", 422)
        ids.add(step["id"])
        if publish and not step["title"].strip():
            fail("Name every step before publishing.", 422)
    field_ids = set()
    fields = content["setup"] + [f for s in content["steps"] for f in s["fields"]]
    for f in fields:
        if f["id"] in field_ids:
            fail("Response identifiers must be unique.", 422)
        field_ids.add(f["id"])
        if publish and not f["name"].strip():
            fail("Name every response before publishing.", 422)
        if f["type"] == "choice" and publish and len(choices(f)) < 2:
            fail("Choices need at least two distinct options.", 422)
        if f["type"] == "number":
            if publish and not f["unit"].strip():
                fail("Measurements require a unit.", 422)
            limits = [number(f[k]) for k in ("min", "max") if f[k] != ""]
            if len(limits) == 2 and limits[0] > limits[1]:
                fail("Minimum cannot exceed maximum.", 422)
            if publish and f["handling"] != "record" and not limits:
                fail("Add at least one measurement limit.", 422)
    if publish and (not content["title"].strip() or not content["steps"]):
        fail("A published workflow needs a name and at least one step.", 422)


def choices(field):
    return list(dict.fromkeys(x.strip() for x in field["options"].splitlines() if x.strip()))


def evaluate(field, value):
    if not value.strip():
        return ("blocked", f"Enter {field['name']}.") if field["required"] else ("recorded", "Not provided.")
    if field["type"] == "choice" and value not in choices(field):
        return "blocked", "Choose one of the configured responses."
    if field["type"] == "confirmation" and value != "confirmed":
        return "blocked", "Confirm this response before continuing."
    if field["type"] == "number":
        try:
            n = number(value)
        except HTTPException:
            return "blocked", "Enter a valid finite measurement."
        outside = ((field["min"] != "" and n < number(field["min"])) or
                   (field["max"] != "" and n > number(field["max"])))
        if outside and field["handling"] != "record":
            return (("blocked", "Outside the configured range. Resolve before continuing.")
                    if field["handling"] == "resolve" else
                    ("flagged", "Outside the configured range. Flagged for review."))
    return "recorded", "Recorded."


def stages(state):
    w = state["workflow"]
    return ([{"id": "setup", "title": "Before starting", "instructions": "Identify the work before you begin.",
              "fields": w["setup"]}] if w["setup"] else []) + w["steps"]


def transition(original, command, source="typed"):
    state = deepcopy(original)
    action = command["type"]
    if state["status"] == "completed":
        fail("Completed sessions are read-only.")
    if state["status"] == "paused" and action != "resume":
        fail("Resume this session before changing it.")
    items = stages(state)
    stage = items[state["position"]] if state["position"] < len(items) else None
    if action in ("pause", "resume"):
        state["status"] = "paused" if action == "pause" else "active"
    elif action == "draft":
        field_id = command.get("fieldId")
        if not stage or not any(f["id"] == field_id for f in stage["fields"]):
            fail("This response does not belong to the current step.", 422)
        if state["drafts"].get(field_id, "") != command["value"]:
            state["drafts"][field_id] = command["value"]
            state["sources"][field_id] = source
            for key in ("completedSteps", "attemptedSteps"):
                state[key] = [x for x in state[key] if x != stage["id"]]
    elif action == "record":
        if not stage:
            fail("Choose a step before recording.")
        results = []
        for field in stage["fields"]:
            fid = field["id"]
            value = state["drafts"].get(fid, "")
            kind, _ = evaluate(field, value)
            previous = state["responses"].get(fid)
            history = deepcopy(previous["history"]) if previous else []
            if previous and previous["value"] != value:
                history.append({k: previous[k] for k in ("value", "source", "at", "kind")})
            state["responses"][fid] = {"value": value, "source": state["sources"].get(fid, source),
                                       "at": now(), "kind": kind, "history": history}
            results.append(kind)
        state["attemptedSteps"] = list(dict.fromkeys(state["attemptedSteps"] + [stage["id"]]))
        state["completedSteps"] = [x for x in state["completedSteps"] if x != stage["id"]]
        if "blocked" not in results:
            state["completedSteps"].append(stage["id"])
    elif action == "next":
        if not stage or stage["id"] not in state["completedSteps"]:
            fail("Record the current step before continuing.")
        state["position"] += 1
    elif action == "go":
        first = next((i for i, s in enumerate(items) if s["id"] not in state["completedSteps"]), len(items))
        p = command.get("position")
        if p is None or p < 0 or p > first:
            fail("Finish preceding steps before opening this step.")
        state["position"] = p
    elif action == "finish":
        if any(s["id"] not in state["completedSteps"] for s in items):
            fail("Record every required step before finishing.")
        if any(evaluate(f, state["drafts"].get(f["id"], ""))[0] == "blocked"
               for s in items for f in s["fields"]):
            fail("Resolve required responses before finishing.")
        state.update(status="completed", completedAt=now())
    state["updatedAt"] = now()
    return state
