from contextlib import asynccontextmanager
import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError

from .api.routes import router
from .api.voice import callbacks, router as voice_router
from .config import settings
from .database import engine

logger = logging.getLogger("lattice")


@asynccontextmanager
async def lifespan(_app):
    yield
    await engine.dispose()


app = FastAPI(title="Lattice API", version="0.1.0", lifespan=lifespan,
              description="Workflow guidance, inspection execution and traceable records.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=["GET", "POST", "PUT", "DELETE"],
                   allow_headers=["Content-Type", "X-Request-ID"], expose_headers=["X-Request-ID"])


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info("request=%s method=%s status=%s", request_id, request.method, response.status_code)
    return response


@app.exception_handler(IntegrityError)
async def integrity_error(_request, _exc):
    return JSONResponse({"detail": "This operation conflicts with a saved record. Refresh and retry."}, status_code=409)


@app.exception_handler(OperationalError)
async def database_error(_request, _exc):
    return JSONResponse({"detail": "The database is unavailable or busy. Check migrations and retry."}, status_code=503)


app.include_router(router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(callbacks, prefix="/api/v1")

# A separate entrypoint lets a local HTTPS tunnel expose only authenticated callbacks.
callback_app = FastAPI(title="Lattice Bolna callbacks", lifespan=lifespan, docs_url=None, redoc_url=None,
                       openapi_url=None)
callback_app.include_router(callbacks, prefix="/api/v1")
