"""Phase 2 architectural and UX design API routes."""

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.schemas.phase2 import (
    DesignBundleResponse,
    EligibleEpicSchema,
    GenerateDesignBundleRequest,
    LockEpicDesignRequest,
    LockEpicDesignResponse,
    LockTechStackRequest,
    ProposeTechStackRequest,
    ProposeTechStackResponse,
    TechStackStatusResponse,
)
from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from src.ai_engine import AIError
from src.taiga_adapter import TaigaAPIError

router = APIRouter()


def get_phase2_service() -> Phase2Service:
    return Phase2Service()


def _handle_error(exc: Exception) -> None:
    if isinstance(exc, Phase2ValidationError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if isinstance(exc, TaigaAPIError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.user_message) from exc
    if isinstance(exc, AIError):
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


@router.get("/eligible-epics", response_model=list[EligibleEpicSchema])
def eligible_epics(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.eligible_epics(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/propose-tech-stack", response_model=ProposeTechStackResponse)
def propose_tech_stack(
    payload: ProposeTechStackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
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


@router.post("/generate-design-bundle", response_model=DesignBundleResponse)
def generate_design_bundle(
    payload: GenerateDesignBundleRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.generate_design_bundle(ctx, epic_id=payload.epic_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/lock-epic-design", response_model=LockEpicDesignResponse)
def lock_epic_design(
    payload: LockEpicDesignRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.lock_epic_design(
            ctx,
            epic_id=payload.epic_id,
            epic_title=payload.epic_title,
            story_ids=payload.story_ids,
            wireframes=payload.wireframes,
            user_flow=payload.user_flow,
            component_tree=payload.component_tree,
            tech_spec=payload.tech_spec,
        )
    except Exception as exc:
        _handle_error(exc)


@router.post("/refresh-story-index")
def refresh_story_index(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    context_manager.reset_cache()
    return {"ok": True}
