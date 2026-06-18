"""Phase 6 spec↔code conformance API routes (Traceability Explorer)."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase6 import (
    ConformanceReportResponse,
    CreateMaintenanceItemRequest,
    DiagnoseRequest,
    EligibleConformanceStoriesResponse,
    MaintenanceItem,
    MaintenanceItemsResponse,
    MaintenanceLogResponse,
    ResolveItemRequest,
    RouteLaneRequest,
    SeveritySuggestionResponse,
    VerifyConformanceRequest,
)
from backend.app.services.maintenance_service import (
    MaintenanceService, MaintenanceValidationError,
)
from backend.app.services.phase6_service import Phase6Service, Phase6ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase6_service() -> Phase6Service:
    return Phase6Service()


def get_maintenance_service() -> MaintenanceService:
    return MaintenanceService()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, (Phase6ValidationError, MaintenanceValidationError)):
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


@router.get("/eligible-stories", response_model=EligibleConformanceStoriesResponse)
def eligible_stories(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase6Service = Depends(get_phase6_service),
):
    try:
        return {"stories": service.get_eligible_stories(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/conformance", response_model=ConformanceReportResponse)
def verify_conformance(
    payload: VerifyConformanceRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase6Service = Depends(get_phase6_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        extra = [f.model_dump() for f in payload.extra_files]
        return service.verify_conformance(ctx, payload.story_id, ai=payload.ai, extra_files=extra)
    except Exception as exc:
        _handle_error(exc)


@router.get("/conformance/{story_id}", response_model=ConformanceReportResponse)
def get_conformance(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase6Service = Depends(get_phase6_service),
):
    try:
        report = service.get_conformance(ctx, story_id)
        if report is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No conformance report for story {story_id}.",
            )
        return report
    except HTTPException:
        raise
    except Exception as exc:
        _handle_error(exc)


# ---------------------------------------------------------------------------
# Maintenance — Triage (F1) + Fix-Bolt & Severity Routing (F2)
# ---------------------------------------------------------------------------

@router.get("/maintenance/items", response_model=MaintenanceItemsResponse)
def list_maintenance_items(
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return {"items": service.list_items(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items", response_model=MaintenanceItem)
def create_maintenance_item(
    payload: CreateMaintenanceItemRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return service.create_item(
            ctx, subject=payload.subject, description=payload.description,
            evidence=payload.evidence, source=payload.source, ext_ref=payload.ext_ref,
            linked_story_id=payload.linked_story_id,
        )
    except Exception as exc:
        _handle_error(exc)


@router.delete("/maintenance/items/{item_id}", response_model=MaintenanceItemsResponse)
def delete_maintenance_item(
    item_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        service.delete_item(ctx, item_id)
        return {"items": service.list_items(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items/{item_id}/classify", response_model=MaintenanceItem)
def classify_maintenance_item(
    item_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.classify(ctx, item_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items/{item_id}/diagnose", response_model=MaintenanceItem)
def diagnose_maintenance_item(
    item_id: int,
    payload: DiagnoseRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.diagnose(ctx, item_id, code_snippet=payload.code_snippet)
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items/{item_id}/fix-brief", response_model=MaintenanceItem)
def fix_brief_maintenance_item(
    item_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.generate_fix_brief(ctx, item_id)
    except Exception as exc:
        _handle_error(exc)


@router.get("/maintenance/items/{item_id}/suggest-lane", response_model=SeveritySuggestionResponse)
def suggest_lane_maintenance_item(
    item_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return service.suggest_lane(ctx, item_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items/{item_id}/route", response_model=MaintenanceItem)
def route_maintenance_item(
    item_id: int,
    payload: RouteLaneRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return service.route_lane(ctx, item_id, payload.lane)
    except Exception as exc:
        _handle_error(exc)


@router.post("/maintenance/items/{item_id}/resolve", response_model=MaintenanceItem)
def resolve_maintenance_item(
    item_id: int,
    payload: ResolveItemRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return service.resolve(
            ctx, item_id, root_cause=payload.root_cause,
            resolution_summary=payload.resolution_summary,
        )
    except Exception as exc:
        _handle_error(exc)


@router.get("/maintenance/log", response_model=MaintenanceLogResponse)
def get_maintenance_log(
    ctx: RequestContext = Depends(get_request_context),
    service: MaintenanceService = Depends(get_maintenance_service),
):
    try:
        return {"maintenance_log_md": service.get_log(ctx)}
    except Exception as exc:
        _handle_error(exc)
