"""Request and response schemas for Phase 6 spec↔code conformance endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.app.schemas.grounding import ExtraContextMixin


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


class RowVerdictSchema(BaseModel):
    ref: str
    kind: Literal["endpoint", "scenario", "constraint"]
    status: str
    rationale: str = ""
    citation: str = ""
    agreement: Literal["unanimous", "split"] = "split"


class PanelMetaSchema(BaseModel):
    escalated: int = 0
    rows: list[RowVerdictSchema] = Field(default_factory=list)


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
    # Present only on adversarial-panel passes (layer == "panel").
    panel_meta: Optional[PanelMetaSchema] = None


class SupplementalFile(BaseModel):
    path: str = Field(max_length=300)
    content: str = Field(max_length=100_000)


class VerifyConformanceRequest(ExtraContextMixin):
    story_id: int
    # ai=False runs the deterministic Layer-A baseline only (no LLM call).
    ai: bool = True
    # panel=True escalates contested rows through the adversarial multi-agent
    # panel (Layer B+); requires ai=True. Default False = single-pass Layer B.
    panel: bool = False
    # User-fetched source files appended to context to resolve `unknown` rows (#1 v2).
    extra_files: list[SupplementalFile] = Field(default_factory=list)


class ScanRegressionsRequest(ExtraContextMixin):
    # panel=True deep-verifies each story through the adversarial panel during the scan.
    panel: bool = False


class WorsenedRow(BaseModel):
    ref: str
    kind: Literal["endpoint", "scenario"]
    old_status: str
    new_status: str


class ScanResultRow(BaseModel):
    story_id: int
    title: str = ""
    old_score: Optional[int] = None
    new_score: int = 0
    regressed: bool = False
    worsened_rows: list[WorsenedRow] = Field(default_factory=list)


class ScanReportResponse(BaseModel):
    results: list[ScanResultRow] = Field(default_factory=list)
    regressed_ids: list[int] = Field(default_factory=list)


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
    source: Literal["manual", "github", "taiga", "jira", "figma"] = "manual"
    ext_ref: str = Field("", max_length=200)
    linked_story_id: Optional[int] = None


class DiagnoseRequest(ExtraContextMixin):
    code_snippet: str = Field("", max_length=20_000)


class ExtraContextRequest(ExtraContextMixin):
    pass


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
