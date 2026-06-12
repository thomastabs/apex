"""Governance analytics API routes."""

from fastapi import APIRouter, Depends

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
    return service.summary(ctx)
