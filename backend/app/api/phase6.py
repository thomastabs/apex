"""Phase 6 spec↔code conformance API routes (Traceability Explorer)."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase6 import (
    ConformanceReportResponse,
    EligibleConformanceStoriesResponse,
    VerifyConformanceRequest,
)
from backend.app.services.phase6_service import Phase6Service, Phase6ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase6_service() -> Phase6Service:
    return Phase6Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase6ValidationError):
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
        return service.verify_conformance(ctx, payload.story_id, ai=payload.ai)
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
