"""Phase 2 architectural and UX design API routes."""

import logging
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase1 import CrossCheckResponse
from backend.app.schemas.phase2 import (
    CrossCheckEndpointsRequest,
    DesignBundleResponse,
    DesignDeltaResponse,
    DesignDeltaStatusResponse,
    DesignSectionRequest,
    DesignSectionResponse,
    DesignSystemResponse,
    DiagramResponse,
    GenerateDesignDeltaRequest,
    GenerateDesignSystemRequest,
    GenerateDiagramRequest,
    GenerateScreenFlowRequest,
    LockDesignRequest,
    LockDesignResponse,
    PersistDesignDeltaRequest,
    PersistDesignDeltaResponse,
    LockTechStackRequest,
    ProposeTechStackRequest,
    ProposeTechStackResponse,
    SaveDiagramPositionsRequest,
    SaveScreenFlowPositionsRequest,
    ScreenFlowFromFigmaRequest,
    ScreenFlowResponse,
    TechStackStatusResponse,
)
from backend.app.schemas.workspace import OkResponse
from backend.app.services.context_service import ContextService
from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

_logger = logging.getLogger("apex.phase2")

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


@router.get("/design", response_model=DesignBundleResponse)
def load_design(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    """Re-hydrate the locked project design from the server (design-bundle.md)."""
    try:
        return service.load_design(ctx)
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
            ctx, section=payload.section, prior_sections=payload.prior,
            instructions=payload.instructions,
        )
    except Exception as exc:
        _handle_error(exc)


@router.post("/cross-check-endpoints", response_model=CrossCheckResponse)
def cross_check_endpoints(
    payload: CrossCheckEndpointsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.cross_check_endpoints(ctx, ux_brief=payload.ux_brief, alt_model=payload.alt_model)
    except Exception as exc:
        _handle_error(exc)


@router.post("/persist-design", response_model=LockDesignResponse)
def persist_design(
    payload: LockDesignRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.persist_design(
            ctx,
            story_ids=payload.story_ids,
            ux_brief=payload.ux_brief,
            endpoints=payload.endpoints,
            data_model=payload.data_model,
        )
    except Exception as exc:
        _handle_error(exc)


@router.get("/design-delta-status", response_model=DesignDeltaStatusResponse)
def design_delta_status(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    """Gherkin-locked stories not yet covered by the locked project design."""
    try:
        return service.design_delta_status(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-design-delta", response_model=DesignDeltaResponse)
def generate_design_delta(
    payload: GenerateDesignDeltaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_design_delta(
            ctx, story_ids=payload.story_ids, instructions=payload.instructions,
        )
    except Exception as exc:
        _handle_error(exc)


@router.post("/persist-design-delta", response_model=PersistDesignDeltaResponse)
def persist_design_delta(
    payload: PersistDesignDeltaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.persist_design_delta(
            ctx,
            story_ids=payload.story_ids,
            ux_brief_addendum=payload.ux_brief_addendum,
            endpoints_delta=payload.endpoints_delta,
            data_model_delta=payload.data_model_delta,
            touches_existing=payload.touches_existing,
            note=payload.note,
        )
    except Exception as exc:
        _handle_error(exc)


@router.get("/diagram", response_model=DiagramResponse | None)
def get_diagram(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.load_diagram(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-diagram", response_model=DiagramResponse)
def generate_diagram(
    payload: GenerateDiagramRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_diagram(ctx, data_model_md=payload.data_model_md)
    except Exception as exc:
        _handle_error(exc)


@router.put("/diagram/positions", response_model=OkResponse)
def save_diagram_positions(
    payload: SaveDiagramPositionsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        service.save_diagram_positions(ctx, nodes=payload.nodes)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/screen-flow", response_model=ScreenFlowResponse | None)
def get_screen_flow(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.load_screen_flow(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-screen-flow", response_model=ScreenFlowResponse)
def generate_screen_flow(
    payload: GenerateScreenFlowRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_screen_flow(ctx, ux_brief_md=payload.ux_brief_md)
    except Exception as exc:
        _handle_error(exc)


@router.post("/screen-flow-from-figma", response_model=ScreenFlowResponse)
def screen_flow_from_figma(
    payload: ScreenFlowFromFigmaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.build_screen_flow_from_figma(
            ctx,
            frames=[f.model_dump() for f in payload.frames],
            flows=[e.model_dump() for e in payload.flows],
        )
    except Exception as exc:
        _handle_error(exc)


@router.put("/screen-flow/positions", response_model=OkResponse)
def save_screen_flow_positions(
    payload: SaveScreenFlowPositionsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        service.save_screen_flow_positions(ctx, nodes=payload.nodes)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/design-system", response_model=DesignSystemResponse | None)
def get_design_system(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
):
    try:
        return service.load_design_system(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-design-system", response_model=DesignSystemResponse)
def generate_design_system(
    payload: GenerateDesignSystemRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase2Service = Depends(get_phase2_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_design_system(ctx, ux_brief_md=payload.ux_brief_md)
    except Exception as exc:
        _handle_error(exc)


@router.post("/refresh-story-index", response_model=OkResponse)
def refresh_story_index(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    context.reset_cache()
    return {"ok": True}
