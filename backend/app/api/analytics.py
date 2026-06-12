"""Governance analytics API routes."""

import json

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.schemas.analytics import AnalyticsSummaryResponse
from backend.app.services.analytics_service import AnalyticsService

router = APIRouter()


def get_analytics_service() -> AnalyticsService:
    return AnalyticsService()


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def analytics_summary(
    ctx: RequestContext = Depends(get_request_context),
    service: AnalyticsService = Depends(get_analytics_service),
):
    try:
        return service.summary(ctx)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Story index is corrupt; rebuild it from workspace settings.",
        ) from exc
    except EnvironmentError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
