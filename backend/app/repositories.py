from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import SessionEvent, SessionRow, VoiceRun, WorkflowRow, WorkflowVersion


async def require(db: AsyncSession, model, key):
    row = await db.get(model, key)
    if row is None or (isinstance(row, WorkflowRow) and row.archived):
        raise HTTPException(404, "Record not found.")
    return row


async def workflows(db):
    return (await db.scalars(select(WorkflowRow).where(WorkflowRow.archived.is_(False))
                            .order_by(WorkflowRow.updated_at.desc()))).all()


async def published(db, workflow):
    return await db.scalar(select(WorkflowVersion).where(
        WorkflowVersion.workflow_id == workflow.id, WorkflowVersion.number == workflow.version))


async def compare_update(db, model, key, revision, values):
    result = await db.execute(update(model).where(model.id == key, model.revision == revision)
                              .values(**values, revision=revision + 1).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise HTTPException(409, "This record changed. Refresh it before trying again.")
    db.expire_all()


async def receipt(db, session_id, request_id):
    return await db.scalar(select(SessionEvent).where(SessionEvent.session_id == session_id,
                                                      SessionEvent.request_id == request_id))


async def sessions(db):
    return (await db.scalars(select(SessionRow))).all()


async def end_voice_runs(db, session_id):
    await db.execute(update(VoiceRun).where(VoiceRun.session_id == session_id)
                     .values(active=False, proposal=None))
