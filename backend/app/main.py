"""FastAPI entrypoint for the decoupled Apex backend."""

import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.phase1 import router as phase1_router
from backend.app.api.phase2 import router as phase2_router
from backend.app.api.workspace import router as workspace_router

app = FastAPI(title="Apex API", version="0.1.0")

_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
_extra = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = _DEFAULT_ORIGINS + _extra

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Taiga-Project-Id"],
)

_MAX_BODY_BYTES = 4 * 1024 * 1024  # 4 MB


class _BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_BYTES:
            return Response("Request body too large (max 4 MB).", status_code=413)
        return await call_next(request)


app.add_middleware(_BodySizeLimitMiddleware)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(phase1_router, prefix="/api/phase1", tags=["phase1"])
app.include_router(phase2_router, prefix="/api/phase2", tags=["phase2"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
