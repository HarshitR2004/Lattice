from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import repositories as repo, services
from ..database import get_db
from ..models import SessionRow, WorkflowRow
from ..schemas import (CreateWorkflow, ImportRequest, RevisionRequest, SessionCommand,
                       StartSession, UpdateWorkflow)

router = APIRouter()


@router.get("/health/live", tags=["Health"])
async def live():
    return {"status": "ok"}


@router.get("/health/ready", tags=["Health"])
async def ready(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1 FROM workflows LIMIT 1"))
    return {"status": "ready"}


@router.get("/workflows", tags=["Workflows"])
async def list_workflows(db: AsyncSession = Depends(get_db)):
    return [await services.workflow_dto(db, w) for w in await repo.workflows(db)]


@router.post("/workflows", status_code=201, tags=["Workflows"])
async def create(data: CreateWorkflow, db: AsyncSession = Depends(get_db)):
    return await services.create_workflow(db, data)


@router.post("/workflows/import", tags=["Workflows"])
async def import_saved(data: ImportRequest, db: AsyncSession = Depends(get_db)):
    return await services.import_workflows(db, data)


@router.get("/workflows/{key}", tags=["Workflows"])
async def get_workflow(key: str, db: AsyncSession = Depends(get_db)):
    return await services.workflow_dto(db, await repo.require(db, WorkflowRow, key))


@router.put("/workflows/{key}", tags=["Workflows"])
async def update_workflow(key: str, data: UpdateWorkflow, db: AsyncSession = Depends(get_db)):
    return await services.update_workflow(db, key, data)


@router.post("/workflows/{key}/publish", tags=["Workflows"])
async def publish(key: str, data: RevisionRequest, db: AsyncSession = Depends(get_db)):
    return await services.publish_workflow(db, key, data.revision)


@router.delete("/workflows/{key}", status_code=204, tags=["Workflows"])
async def archive(key: str, revision: int, db: AsyncSession = Depends(get_db)):
    await repo.require(db, WorkflowRow, key)
    await repo.compare_update(db, WorkflowRow, key, revision, {"archived": True})
    return Response(status_code=204)


@router.get("/workflows/{key}/export", tags=["Workflows"])
async def export_workflow(key: str, db: AsyncSession = Depends(get_db)):
    return JSONResponse(await get_workflow(key, db), headers={
        "Content-Disposition": 'attachment; filename="lattice-workflow.json"'})


@router.get("/sessions", tags=["Sessions"])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    return sorted([services.session_dto(s) for s in await repo.sessions(db)],
                  key=lambda s: s["createdAt"], reverse=True)


@router.post("/sessions", status_code=201, tags=["Sessions"])
async def start(data: StartSession, db: AsyncSession = Depends(get_db)):
    return await services.start_session(db, data)


@router.get("/sessions/{key}", tags=["Sessions"])
async def get_session(key: str, db: AsyncSession = Depends(get_db)):
    return services.session_dto(await repo.require(db, SessionRow, key))


@router.post("/sessions/{key}/actions", tags=["Sessions"])
async def command(key: str, data: SessionCommand, db: AsyncSession = Depends(get_db)):
    return await services.apply_command(db, key, data)


@router.get("/sessions/{key}/events", tags=["Sessions"])
async def events(key: str, db: AsyncSession = Depends(get_db)):
    return await services.audit_events(db, key)


@router.get("/sessions/{key}/export", tags=["Sessions"])
async def export_session(key: str, db: AsyncSession = Depends(get_db)):
    result = await get_session(key, db)
    result["reviewStatus"] = "Awaiting human review"
    result["events"] = await services.audit_events(db, key)
    return JSONResponse(result, headers={"Content-Disposition": 'attachment; filename="lattice-session.json"'})
