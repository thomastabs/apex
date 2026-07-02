"""Response schemas for the AI usage/cost telemetry endpoint."""

from pydantic import BaseModel, Field


class ModelUsageRow(BaseModel):
    model: str
    provider: str = ""
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class CallUsageRow(BaseModel):
    call: str
    calls: int = 0
    cost_usd: float = 0.0


class DayUsageRow(BaseModel):
    date: str
    calls: int = 0
    cost_usd: float = 0.0


class UsageSummaryResponse(BaseModel):
    days: int = 30
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_calls: int = 0
    by_model: list[ModelUsageRow] = Field(default_factory=list)
    by_call: list[CallUsageRow] = Field(default_factory=list)
    by_day: list[DayUsageRow] = Field(default_factory=list)
