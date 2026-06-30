"""Autopilot API routes."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from backend.app.api.deps import RequestContext, get_request_context, resolve_taiga_base
from backend.app.schemas.autopilot import (
    AutopilotControlResponse,
    AutopilotStartRequest,
    AutopilotStartResponse,
    AutopilotStatusResponse,
    AutopilotSteerRequest,
)
from backend.app.services import autopilot_service

_logger = logging.getLogger("apex.autopilot_api")

router = APIRouter()


@router.post("/start", response_model=AutopilotStartResponse)
def autopilot_start(
    body: AutopilotStartRequest,
    ctx: RequestContext = Depends(get_request_context),
    taiga_base: str = Depends(resolve_taiga_base),
) -> AutopilotStartResponse:
    job_id = autopilot_service.start_job(
        ctx,
        concept=body.concept,
        epics=[e.model_dump() for e in body.epics],
        tech_stack_hint=body.tech_stack_hint,
        settings=body.settings.model_dump(),
        taiga_base=taiga_base,
        figma_file_key=body.figma_file_key,
        figma_token=body.figma_token,
        figma_project_id=body.figma_project_id,
    )
    return AutopilotStartResponse(job_id=job_id)


@router.get("/{job_id}", response_model=AutopilotStatusResponse)
def autopilot_status(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotStatusResponse:
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    snap = autopilot_service.serialize_job(job)
    return AutopilotStatusResponse(**snap)


@router.post("/{job_id}/pause", response_model=AutopilotControlResponse)
def autopilot_pause(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotControlResponse:
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    autopilot_service.pause_job(job_id)
    return AutopilotControlResponse(ok=True, state=autopilot_service.get_job(job_id)["state"])


@router.post("/{job_id}/resume", response_model=AutopilotControlResponse)
def autopilot_resume(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotControlResponse:
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    autopilot_service.resume_job(job_id)
    return AutopilotControlResponse(ok=True, state=autopilot_service.get_job(job_id)["state"])


@router.post("/{job_id}/stop", response_model=AutopilotControlResponse)
def autopilot_stop(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotControlResponse:
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    autopilot_service.stop_job(job_id)
    return AutopilotControlResponse(ok=True, state="stopped")


@router.get("/{job_id}/stream")
async def autopilot_stream(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> StreamingResponse:
    """Stream live job status as newline-delimited JSON.

    Pushes a full status snapshot the instant the event list or state changes
    (server tick 0.25s), so the UI updates in real time instead of polling every
    1.5s. Each frame is the same shape as GET /{job_id}; the client replaces its
    cached status with it (reconnecting simply gets a fresh full snapshot, so no
    cursor/backfill is needed). A periodic ping keeps the connection alive through
    ingress idle timeouts. The poll endpoint remains the fallback."""
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")

    async def _gen():
        last_count = -1
        last_state: str | None = None
        idle_ticks = 0
        while True:
            ev_count = len(job["events"])
            state = job["state"]
            if ev_count != last_count or state != last_state:
                last_count, last_state = ev_count, state
                idle_ticks = 0
                yield json.dumps(autopilot_service.serialize_job(job)).encode() + b"\n"
            else:
                idle_ticks += 1
                if idle_ticks >= 40:  # ~10s heartbeat
                    idle_ticks = 0
                    yield b'{"type":"ping"}\n'
            if state in ("done", "error", "stopped"):
                break
            await asyncio.sleep(0.25)

    return StreamingResponse(_gen(), media_type="application/x-ndjson")


@router.post("/{job_id}/steer", response_model=AutopilotControlResponse)
def autopilot_steer(
    job_id: str,
    payload: AutopilotSteerRequest,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotControlResponse:
    """Set/clear a live steer note applied to every subsequent generative step."""
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    autopilot_service.steer_job(job_id, payload.note)
    return AutopilotControlResponse(ok=True, state=autopilot_service.get_job(job_id)["state"])


@router.post("/{job_id}/take-over", response_model=AutopilotControlResponse)
def autopilot_take_over(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
) -> AutopilotControlResponse:
    """Stop the autopilot and hand control back to the user."""
    job = autopilot_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    autopilot_service.stop_job(job_id)
    return AutopilotControlResponse(ok=True, state="stopped")
