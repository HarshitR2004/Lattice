from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.database import Base, make_engine
from app.models import SessionRow
from app.schemas import CreateWorkflow, StartSession
from app import services
from test_inspections import workflow


async def test_reopen_database_keeps_workflow_version_and_session(tmp_path):
    url = f"sqlite+aiosqlite:///{(tmp_path / 'persistent.db').as_posix()}"
    first = make_engine(url)
    async with first.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(first, expire_on_commit=False)
    async with factory() as db:
        w = await services.create_workflow(db, CreateWorkflow.model_validate(workflow()))
        w = await services.publish_workflow(db, w["id"], w["revision"])
        session = await services.start_session(db, StartSession(workflowId=w["id"], label="Persistence check"))
        await db.commit()
    await first.dispose()
    second = make_engine(url)
    factory = async_sessionmaker(second, expire_on_commit=False)
    async with factory() as db:
        recovered = await db.scalar(select(SessionRow).where(SessionRow.id == session["id"]))
        assert recovered.state["label"] == "Persistence check"
        assert recovered.state["workflow"]["version"] == 1
    await second.dispose()
