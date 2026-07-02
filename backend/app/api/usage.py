"""AI usage/cost telemetry API routes."""

from fastapi import APIRouter, Depends, Header, Query

from backend.app.api.deps import AuthContext, anchor_instance_id, get_auth_context
from backend.app.schemas.usage import UsageSummaryResponse
from backend.app.services.usage_service import UsageService

router = APIRouter()


def get_usage_service() -> UsageService:
    return UsageService()


@router.get("/summary", response_model=UsageSummaryResponse)
def usage_summary(
    days: int = Query(default=30, ge=1, le=90),
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
    service: UsageService = Depends(get_usage_service),
):
    service.configure_request(anchor_instance_id(x_taiga_url))
    return service.summary(days)
