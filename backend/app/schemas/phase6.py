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


class SupplementalFile(BaseModel):
    path: str = Field(max_length=300)
    content: str = Field(max_length=100_000)


class VerifyConformanceRequest(BaseModel):
    story_id: int
    # ai=False runs the deterministic Layer-A baseline only (no LLM call).
    ai: bool = True
    # User-fetched source files appended to context to resolve `unknown` rows (#1 v2).
    extra_files: list[SupplementalFile] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Phase 6 Maintenance — Triage (F1) + Fix-Bolt & Severity Routing (F2)
# ---------------------------------------------------------------------------

class MaintenanceItem(BaseModel):
    id: int
    source: str = "manual"
    ext_ref: str = ""
    subject: str = ""
    description: str = ""
    evidence: str = ""
    linked_story_id: Optional[int] = None
    classification: str = "unclassified"
    status: str = "new"
    diagnosis_md: str = ""
    fix_brief_md: str = ""
    lane: Optional[str] = None
    ai_rationale: dict = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


class MaintenanceItemsResponse(BaseModel):
    items: list[MaintenanceItem] = Field(default_factory=list)


class CreateMaintenanceItemRequest(BaseModel):
    subject: str = Field(..., max_length=300)
    description: str = Field("", max_length=20_000)
    evidence: str = Field("", max_length=20_000)
    source: Literal["manual", "github", "taiga"] = "manual"
    ext_ref: str = Field("", max_length=200)
    linked_story_id: Optional[int] = None


class DiagnoseRequest(BaseModel):
    code_snippet: str = Field("", max_length=20_000)


class RouteLaneRequest(BaseModel):
    lane: Literal["fast", "secure"]


class ResolveItemRequest(BaseModel):
    root_cause: str = Field("", max_length=2_000)
    resolution_summary: str = Field("", max_length=2_000)


class SeveritySuggestionResponse(BaseModel):
    lane: str = "secure"
    rationale: str = ""


class MaintenanceLogResponse(BaseModel):
    maintenance_log_md: str = ""
