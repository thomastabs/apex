"""FastAPI entrypoint for the decoupled Apex backend."""

import logging
import os

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.figma_proxy import router as figma_proxy_router
from backend.app.api.github_webhook import router as github_webhook_router
from backend.app.api.taiga_proxy import router as taiga_proxy_router
from backend.app.api.plane_proxy import router as plane_proxy_router
from backend.app.api.phase1 import router as phase1_router
from backend.app.api.phase2 import router as phase2_router
from backend.app.api.phase3 import router as phase3_router
from backend.app.api.phase4 import router as phase4_router
from backend.app.api.phase5 import router as phase5_router
from backend.app.api.phase6 import router as phase6_router
from backend.app.api.analytics import router as analytics_router
from backend.app.api.usage import router as usage_router
from backend.app.api.workspace import router as workspace_router
from backend.app.api.autopilot import router as autopilot_router

_logger = logging.getLogger("apex.main")

# Nothing configured logging before, so every `_logger.debug` in the codebase
# was invisible and the effective root level was whatever uvicorn installed.
# A user-visible failure has to leave a server-side trace to be diagnosable.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="Apex API", version="0.1.0")

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://apex-bolt.com",
]


def _parse_extra_origins(raw: str) -> list[str]:
    origins = []
    for o in raw.split(","):
        o = o.strip()
        if not o:
            continue
        if not (o.startswith("https://") or o.startswith("http://localhost") or o.startswith("http://127.0.0.1")):
            _logger.warning("ALLOWED_ORIGINS: skipping invalid origin %r (must be https:// or http://localhost)", o)
            continue
        origins.append(o)
    return origins


_extra = _parse_extra_origins(os.getenv("ALLOWED_ORIGINS", ""))
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
        # JSON, not text/plain: the frontend parses `{"detail": ...}` uniformly
        # and used to choke on this layer's bare-string responses.
        return JSONResponse({"detail": "Invalid Content-Length header."}, status_code=400)
    if cl_int > _MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large (max 4 MB)."}, status_code=413)
    if not content_length:
        # Chunked / no Content-Length: drain the stream, bailing early past the
        # limit, then cache the bytes in request._body — the attribute
        # Request.body()/.json() read from. Setting _body is the stable Starlette
        # idiom; the old request._stream replay reached into the raw receive
        # channel and broke across Starlette upgrades (audit M2).
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > _MAX_BODY_BYTES:
                return JSONResponse({"detail": "Request body too large (max 4 MB)."}, status_code=413)
        request._body = body  # type: ignore[attr-defined]
    try:
        return await call_next(request)
    except Exception:
        _logger.exception("Unhandled exception in request %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.middleware("http")
async def _security_headers(request: Request, call_next) -> Response:
    """Baseline hardening headers on every backend (JSON API) response (audit M10).

    Added after the body-size middleware so it also wraps that middleware's
    413/400/500 responses. CORS is still outermost.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


# CORSMiddleware is added last so it is the outermost wrapper.
# Every response — including 500s from the body-size middleware — gets CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Project-Id", "X-Taiga-Project-Id", "X-Taiga-Url", "X-Figma-Token", "X-Figma-Force", "X-Api-Key", "X-Plane-Url", "X-Plane-Workspace"],
)


def _validation_detail(exc: RequestValidationError) -> str:
    """Flatten Pydantic's `[{loc, msg, type}]` into one readable sentence.

    FastAPI's default handler returns the raw list, which is neither the
    `{"detail": "<string>"}` shape every other error uses nor something a toast
    can show. The frontend can still parse the list form, but a plain string is
    what actually names the offending field to a user.
    """
    parts: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", ()) if p != "body")
        msg = str(err.get("msg", "invalid value"))
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "; ".join(parts) or "Request validation failed."


@app.exception_handler(RequestValidationError)
async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    detail = _validation_detail(exc)
    _logger.info("request_validation_failed path=%s detail=%s", request.url.path, detail)
    return JSONResponse({"detail": detail}, status_code=422)


@app.exception_handler(StarletteHTTPException)
async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Normalise every HTTPException into `{"detail": ...}` and log 5xx.

    Routers raise `HTTPException` with either a string or a `{code, message}`
    dict; both pass straight through. The logging is the point: 502/503/504
    responses (AI failures, unreachable Taiga) previously left no server-side
    trace at all.
    """
    if exc.status_code >= 500:
        _logger.error(
            "http_error status=%d path=%s detail=%s", exc.status_code, request.url.path, exc.detail,
        )
    headers = getattr(exc, "headers", None)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)


@app.exception_handler(TimeoutError)
async def _handle_lock_timeout(request: Request, exc: TimeoutError) -> JSONResponse:
    """A contended write lock is a transient busy state, not a server bug.

    `src/distributed.py` raises TimeoutError when the story-index / config /
    usage lock is not acquired within its window. Unhandled, that surfaced as a
    bare 500 "Internal server error" after a 15-second hang, which tells the
    user nothing and discourages the retry that would actually work.
    """
    _logger.warning("lock_timeout path=%s detail=%s", request.url.path, exc)
    return JSONResponse(
        {"detail": {"code": "workspace_busy", "message": "The workspace is busy with another write. Try again in a moment."}},
        status_code=503,
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(phase1_router, prefix="/api/phase1", tags=["phase1"])
app.include_router(phase2_router, prefix="/api/phase2", tags=["phase2"])
app.include_router(phase3_router, prefix="/api/phase3", tags=["phase3"])
app.include_router(phase4_router, prefix="/api/phase4", tags=["phase4"])
app.include_router(phase5_router, prefix="/api/phase5", tags=["phase5"])
app.include_router(phase6_router, prefix="/api/phase6", tags=["phase6"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(usage_router, prefix="/api/usage", tags=["usage"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(autopilot_router, prefix="/api/autopilot", tags=["autopilot"])
app.include_router(taiga_proxy_router, prefix="/api/pm/taiga", tags=["taiga-proxy"])
app.include_router(plane_proxy_router, prefix="/api/pm/plane", tags=["plane-proxy"])
app.include_router(figma_proxy_router, prefix="/api/design/figma", tags=["figma-proxy"])
app.include_router(github_webhook_router, prefix="/api/webhooks", tags=["webhooks"])
