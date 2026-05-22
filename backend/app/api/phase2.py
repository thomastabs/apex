"""Phase 2 architectural and UX design API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase2 import (
    DesignSectionRequest,
    DesignSectionResponse,
    LockDesignRequest,
    LockDesignResponse,
    LockTechStackRequest,
    ProposeTechStackRequest,
    ProposeTechStackResponse,
    TechStackStatusResponse,
)
from backend.app.schemas.workspace import OkResponse
from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase2_service() -> Phase2Service:
    return Phase2Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase2ValidationError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    if isinstance(exc, AIRateLimitError):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    if isinstance(exc, AITimeoutError):
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    if isinstance(exc, AIError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if isinstance(exc, EnvironmentError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    raise exc


@router.get("/tech-stack-status", response_model=TechStackStatusResponse)
def tech_stack_status(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.tech_stack_status(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/propose-tech-stack", response_model=ProposeTechStackResponse)
def propose_tech_stack(
    payload: ProposeTechStackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return {"alternatives": service.propose_tech_stack(ctx, hint=payload.hint)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/lock-tech-stack", response_model=TechStackStatusResponse)
def lock_tech_stack(
    payload: LockTechStackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.lock_tech_stack(ctx, tech_stack=payload.tech_stack)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-design-section", response_model=DesignSectionResponse)
def generate_design_section(
    payload: DesignSectionRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_design_section(
            ctx, section=payload.section, prior_sections=payload.prior
        )
    except Exception as exc:
        _handle_error(exc)


@router.post("/persist-design", response_model=LockDesignResponse)
def persist_design(
    payload: LockDesignRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        service.configure_request(ctx)
        locked_story_ids = payload.story_ids
        if not locked_story_ids:
            raise Phase2ValidationError("At least one story_id is required.")
        service.context.write_project_design_bundle(
            payload.wireframes,
            payload.user_flow,
            payload.component_tree,
            payload.tech_spec,
        )
        service.context.write_project_technical_spec(locked_story_ids, payload.tech_spec)
        return {"ok": True, "story_ids": locked_story_ids, "taiga_failures": []}
    except Exception as exc:
        _handle_error(exc)


@router.post("/refresh-story-index", response_model=OkResponse)
def refresh_story_index(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    context_manager.reset_cache()
    return {"ok": True}
