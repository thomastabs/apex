"""FastAPI entrypoint for the decoupled Apex backend."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(phase1_router, prefix="/api/phase1", tags=["phase1"])
app.include_router(phase2_router, prefix="/api/phase2", tags=["phase2"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
