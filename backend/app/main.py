"""FastAPI entrypoint for the decoupled Apex backend."""

import logging
import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.jira_proxy import router as jira_proxy_router
from backend.app.api.taiga_proxy import router as taiga_proxy_router
from backend.app.api.phase1 import router as phase1_router
from backend.app.api.phase2 import router as phase2_router
from backend.app.api.phase3 import router as phase3_router
from backend.app.api.phase4 import router as phase4_router
from backend.app.api.workspace import router as workspace_router

_logger = logging.getLogger("apex.main")

app = FastAPI(title="Apex API", version="0.1.0")

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://apex-bolt.com",
]
_extra = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = _DEFAULT_ORIGINS + _extra

_MAX_BODY_BYTES = 4 * 1024 * 1024  # 4 MB


@app.middleware("http")
async def _body_size_limit(request: Request, call_next) -> Response:
    """Reject requests whose body exceeds _MAX_BODY_BYTES.

    Uses a plain async middleware instead of BaseHTTPMiddleware to avoid the
    Starlette bug where unhandled exceptions escape BaseHTTPMiddleware and
    bypass CORSMiddleware, causing responses with no CORS headers.
    """
    content_length = request.headers.get("content-length")
    try:
        cl_int = int(content_length) if content_length else 0
    except ValueError:
        return Response("Invalid Content-Length header.", status_code=400)
    if cl_int > _MAX_BODY_BYTES:
        return Response("Request body too large (max 4 MB).", status_code=413)
    if not content_length:
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > _MAX_BODY_BYTES:
                return Response("Request body too large (max 4 MB).", status_code=413)
        async def _replay():
            yield body
        request._stream = _replay()  # type: ignore[attr-defined]
    try:
        return await call_next(request)
    except Exception:
        _logger.exception("Unhandled exception in request %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)


# CORSMiddleware is added last so it is the outermost wrapper.
# Every response — including 500s from the body-size middleware — gets CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Project-Id", "X-Taiga-Project-Id", "X-Jira-Base-Url", "X-Taiga-Url"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(phase1_router, prefix="/api/phase1", tags=["phase1"])
app.include_router(phase2_router, prefix="/api/phase2", tags=["phase2"])
app.include_router(phase3_router, prefix="/api/phase3", tags=["phase3"])
app.include_router(phase4_router, prefix="/api/phase4", tags=["phase4"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(jira_proxy_router, prefix="/api/pm/jira", tags=["jira-proxy"])
app.include_router(taiga_proxy_router, prefix="/api/pm/taiga", tags=["taiga-proxy"])
