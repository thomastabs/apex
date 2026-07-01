"""FastAPI entrypoint for the decoupled Apex backend."""

import logging
import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.figma_proxy import router as figma_proxy_router
from backend.app.api.jira_proxy import router as jira_proxy_router
from backend.app.api.taiga_proxy import router as taiga_proxy_router
from backend.app.api.phase1 import router as phase1_router
from backend.app.api.phase2 import router as phase2_router
from backend.app.api.phase3 import router as phase3_router
from backend.app.api.phase4 import router as phase4_router
from backend.app.api.phase5 import router as phase5_router
from backend.app.api.phase6 import router as phase6_router
from backend.app.api.analytics import router as analytics_router
from backend.app.api.workspace import router as workspace_router
from backend.app.api.autopilot import router as autopilot_router

_logger = logging.getLogger("apex.main")

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
        return Response("Invalid Content-Length header.", status_code=400)
    if cl_int > _MAX_BODY_BYTES:
        return Response("Request body too large (max 4 MB).", status_code=413)
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
                return Response("Request body too large (max 4 MB).", status_code=413)
        request._body = body  # type: ignore[attr-defined]
    try:
        return await call_next(request)
    except Exception:
        _logger.exception("Unhandled exception in request %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)


_AI_KEY_HEADERS = {
    "anthropic": "x-anthropic-api-key",
    "openai": "x-openai-api-key",
    "google": "x-google-api-key",
}
_MAX_AI_KEY_LEN = 512  # generous upper bound for any provider's key format


@app.middleware("http")
async def _ai_user_keys(request: Request, call_next) -> Response:
    """Pick up bring-your-own AI provider keys from request headers.

    Populates ai_engine's per-request ContextVar so every AI call in this
    request's call chain prefers the user's own key over the deployment-wide
    env var, without threading it through every phase service function. Never
    persisted — the browser resends it on every request (see contextHeaders
    in the frontend), same pattern as the Taiga/Jira Authorization header.
    """
    from src.ai_engine import set_user_api_keys

    keys = {
        provider: value
        for provider, header in _AI_KEY_HEADERS.items()
        if (value := request.headers.get(header, "").strip()) and len(value) <= _MAX_AI_KEY_LEN
    }
    set_user_api_keys(keys)
    return await call_next(request)


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
    allow_headers=["Authorization", "Content-Type", "X-Project-Id", "X-Taiga-Project-Id", "X-Jira-Base-Url", "X-Taiga-Url", "X-Figma-Token", "X-Figma-Force", "X-Anthropic-Api-Key", "X-Openai-Api-Key", "X-Google-Api-Key"],
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
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(autopilot_router, prefix="/api/autopilot", tags=["autopilot"])
app.include_router(jira_proxy_router, prefix="/api/pm/jira", tags=["jira-proxy"])
app.include_router(taiga_proxy_router, prefix="/api/pm/taiga", tags=["taiga-proxy"])
app.include_router(figma_proxy_router, prefix="/api/design/figma", tags=["figma-proxy"])
