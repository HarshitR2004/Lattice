from copy import deepcopy
from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import repositories as repo, services
from ..config import settings
from ..database import get_db
from ..domain import evaluate, fail, now, stages, transition
from ..integrations.bolna import bolna
from ..models import SessionRow, VoiceRun
from ..schemas import uid

router = APIRouter(tags=["Voice"])
callbacks = APIRouter(tags=["Bolna callbacks"])


class ToolRequest(BaseModel):
    lattice_voice_run_id: str
    request_id: str = Field(min_length=1, max_length=100)
    action: str = "context"
    field_id: str | None = None
    value: str = Field(default="", max_length=20000)
    proposal_id: str | None = None
    position: int | None = None
    confirmed: bool = False


@router.get("/voice/status")
async def voice_status():
    return {"configured": settings.voice_configured, "provider": "bolna"}


@router.post("/sessions/{key}/voice/session")
async def mint(key: str, db: AsyncSession = Depends(get_db)):
    if not settings.voice_configured:
        raise HTTPException(503, "Configure Bolna and the public callback URL to enable voice.")
    row = await repo.require(db, SessionRow, key)
    if row.state["status"] != "active":
        fail("Voice requires an active inspection session.")
    await repo.end_voice_runs(db, key)
    run_id = uid()
    db.add(VoiceRun(id=run_id, session_id=key, active=True, created_at=now(),
                    expires_at=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()))
    await db.commit()
    try:
        result = await bolna.mint(run_id)
    except HTTPException:
        run = await repo.require(db, VoiceRun, run_id)
        run.active = False
        await db.commit()
        raise
    run = await repo.require(db, VoiceRun, run_id)
    run.provider_run_id = result.get("run_id")
    await db.commit()
    return result


@router.post("/sessions/{key}/voice/end")
async def end(key: str, db: AsyncSession = Depends(get_db)):
    await repo.require(db, SessionRow, key)
    await repo.end_voice_runs(db, key)
    return {"ended": True}


def callback_auth(authorization: str = Header(default="")):
    expected = f"Bearer {settings.bolna_callback_secret}"
    if not settings.bolna_callback_secret or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, "Invalid callback credentials.")


def context(state):
    items = stages(state)
    stage = items[state["position"]] if state["position"] < len(items) else None
    return {"session": state, "currentStep": stage, "procedure": state["workflow"]["procedure"],
            "instruction": "Use only this workflow and its recorded responses. Never invent missing instructions."}


@callbacks.post("/integrations/bolna/tool", dependencies=[Depends(callback_auth)])
async def tool(data: ToolRequest, db: AsyncSession = Depends(get_db)):
    run = await repo.require(db, VoiceRun, data.lattice_voice_run_id)
    if not run.active or datetime.fromisoformat(run.expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        fail("This voice run has ended. Start a new voice conversation.")
    row = await repo.require(db, SessionRow, run.session_id)
    state = services.session_dto(row)
    if data.action == "context":
        return context(state)
    previous = await repo.receipt(db, row.id, data.request_id)
    if previous:
        if previous.action.get("source") != "bolna" or previous.action.get("voiceRequest") != data.model_dump():
            fail("This voice operation ID belongs to another action.")
        return context(previous.result)
    if state["status"] != "active":
        fail("This inspection is not active.")
    if data.action == "propose":
        proposal = run.proposal
        if proposal and proposal.get("requestId") == data.request_id:
            if proposal["fieldId"] != data.field_id or proposal["value"] != data.value:
                fail("This proposal ID was already used for a different answer.")
            return proposal
        change = {"type": "draft", "fieldId": data.field_id, "value": data.value}
        staged = transition(state, change, "bolna")
        current = stages(staged)[staged["position"]]
        field = next(f for f in current["fields"] if f["id"] == data.field_id)
        kind, message = evaluate(field, data.value)
        if kind == "blocked":
            return {"accepted": False, "message": message}
        staged.pop("revision", None)
        revision = row.revision
        key = row.id
        await repo.compare_update(db, SessionRow, key, revision, {"state": staged})
        run = await repo.require(db, VoiceRun, data.lattice_voice_run_id)
        proposal = {"id": uid(), "requestId": data.request_id, "revision": revision + 1,
                    "fieldId": data.field_id, "value": data.value, "message": message}
        run.proposal = proposal
        return {**proposal, "needsConfirmation": True}
    if data.action == "confirm":
        proposal = deepcopy(run.proposal)
        if not data.confirmed or not proposal or proposal["id"] != data.proposal_id:
            fail("Repeat the proposed answer and obtain explicit confirmation first.")
        if proposal["revision"] != row.revision:
            fail("The inspection changed. Capture and confirm the answer again.")
        result = await services.apply_command(db, row.id, {"type": "record", "revision": row.revision,
                                                           "requestId": data.request_id,
                                                           "voiceRequest": data.model_dump()}, "bolna")
        run = await repo.require(db, VoiceRun, data.lattice_voice_run_id)
        # Retain proposal for harmless retries; subsequent commands invalidate its revision.
        run.proposal = proposal
        return context(result)
    if data.action not in ("next", "go", "pause", "finish"):
        fail("Unsupported voice action.", 422)
    if data.action == "finish" and not data.confirmed:
        fail("Ask for explicit confirmation before finishing the inspection.")
    result = await services.apply_command(db, row.id, {"type": data.action, "revision": row.revision,
                                                       "requestId": data.request_id,
                                                       "voiceRequest": data.model_dump(),
                                                       "position": data.position}, "bolna")
    return context(result)
