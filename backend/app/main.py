from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
import asyncio
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.author import router as author_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.integration_obsidian import router as obsidian_router
from app.api.notes import router as notes_router
from app.api.contributions import router as contributions_router
from app.api.proposals import router as proposals_router
from app.api.repository import router as repository_router
from app.api.users import router as users_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.db.session import async_session_factory, engine
from app.services.github import GitHubAppClient
from app.services.integration_errors import IntegrationError, error_payload
from app.services.sync import pull_connected_gits

logger = logging.getLogger(__name__)


async def _personal_sync_loop() -> None:
    interval = settings.personal_sync_interval_seconds
    if interval <= 0:
        return
    while True:
        await asyncio.sleep(interval)
        try:
            async with async_session_factory() as database:
                await pull_connected_gits(database, GitHubAppClient())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("periodic personal git pull failed", exc_info=True)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_personal_sync_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(author_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(repository_router)
app.include_router(notes_router)
app.include_router(graph_router)
app.include_router(proposals_router)
app.include_router(contributions_router)
app.include_router(webhooks_router)
app.include_router(obsidian_router)


def _obsidian_path(request: Request) -> bool:
    return request.url.path.startswith("/integrations/obsidian/")


@app.exception_handler(IntegrationError)
async def integration_error_handler(request: Request, exc: IntegrationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    headers = {"Cache-Control": "no-store", "X-Request-ID": request_id}
    if exc.retry_after is not None:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(
            code=exc.code,
            message=exc.message,
            request_id=request_id,
            retryable=exc.retryable,
            details=exc.details,
        ),
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    if _obsidian_path(request):
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        details = []
        for item in exc.errors():
            loc = ".".join(str(part) for part in item.get("loc", ()))
            details.append({"field": loc, "message": item.get("msg")})
        return JSONResponse(
            status_code=400,
            content=error_payload(
                code="invalid_request",
                message="запрос не соответствует контракту",
                request_id=request_id,
                retryable=False,
                details=details,
            ),
            headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
        )
    return await request_validation_exception_handler(request, exc)
