"""Request and response schemas for Phase 6 spec↔code conformance endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class EligibleConformanceStory(BaseModel):
    story_id: int
    title: str
    epic_title: str
    phase_status: str
    has_conformance: bool
    score: Optional[int] = None


class EligibleConformanceStoriesResponse(BaseModel):
    stories: list[EligibleConformanceStory]


class EndpointConformanceSchema(BaseModel):
    contract: str
    status: Literal["present", "missing", "mismatch", "unknown"]
    location: str = ""
    notes: str = ""


class ScenarioConformanceSchema(BaseModel):
    scenario: str
    status: Literal["tested", "untested", "partial", "unknown"]
    test_location: str = ""
    notes: str = ""


class ConstraintConformanceSchema(BaseModel):
    constraint_id: str
    status: Literal["addressed", "not_found", "unknown"]
    evidence: str = ""


class ConformanceReportResponse(BaseModel):
    story_id: int
    title: str = ""
    epic_title: str = ""
    layer: str = ""
    score: int = 0
    summary: str = ""
    endpoints: list[EndpointConformanceSchema] = Field(default_factory=list)
    scenarios: list[ScenarioConformanceSchema] = Field(default_factory=list)
    constraints: list[ConstraintConformanceSchema] = Field(default_factory=list)
    generated_at: str = ""


class VerifyConformanceRequest(BaseModel):
    story_id: int
    # ai=False runs the deterministic Layer-A baseline only (no LLM call).
    ai: bool = True
