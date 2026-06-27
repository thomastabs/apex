"""Autopilot API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context, resolve_taiga_base
from backend.app.schemas.autopilot import (
    AutopilotControlResponse,
    AutopilotStartRequest,
    AutopilotStartResponse,
    AutopilotStatusResponse,
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
