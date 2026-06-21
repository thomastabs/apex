"""Schemas for shell/sidebar workspace endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

PhaseStatus = Literal[
    "new", "gherkin_locked", "design_locked", "implementation", "qa", "qa_passed", "deployed",
]


class PhaseStatusResponse(BaseModel):
    phase_status: str | None = None


class LogDecisionRequest(BaseModel):
    scope: str = Field(max_length=200)
    summary: str = Field(max_length=2_000)
    reason: str = Field("", max_length=2_000)


class SetPhaseStatusRequest(BaseModel):
    phase_status: PhaseStatus


class ContextFileSchema(BaseModel):
    filename: str
    label: str
    content: str
    chars: int
    last_modified: str | None = None


class SpecDriftInfo(BaseModel):
    amended: bool = False
    filename: str = ""
    affected_story_ids: list[int] = Field(default_factory=list)
    note: str = ""


class ContextFilesResponse(BaseModel):
    files: list[ContextFileSchema]
    total_chars: int
    # Set only by update_context_file when a post-lock spec edit raises drift.
    drift: SpecDriftInfo | None = None


class UpdateContextFileRequest(BaseModel):
    content: str = Field(..., max_length=5_242_880)  # 5 MB
    note: str = Field("", max_length=500)


class AmendmentsResponse(BaseModel):
    amendments_md: str = ""


class SaveAiConfigRequest(BaseModel):
    model: str | None = Field(None, max_length=200)


class SaveConfigRequest(BaseModel):
    project_id: int | None = None
    pm_tool: str | None = Field(None, max_length=20)
    taiga_url: str | None = Field(None, max_length=2_048)
    jira_base_url: str | None = Field(None, max_length=2_048)
    github_repo: str | None = Field(None, max_length=255)


class OkResponse(BaseModel):
    ok: bool = True


class ConfigResponse(BaseModel):
    project_id: int | None = None
    taiga_web_url: str = ""
    pm_tool: str = "taiga"
    pm_web_url: str = ""
    github_repo: str = ""


class AiConfigModel(BaseModel):
    id: str
    label: str
    role: str = ""
    provider: str = "anthropic"
    note: str = ""


class AiConfigResponse(BaseModel):
    model: str
    available_models: list[AiConfigModel] = Field(default_factory=list)
    configured_providers: list[str] = Field(default_factory=list)


class TraceFlagInfo(BaseModel):
    story_id: int
    phase: str = ""        # phase_status to re-open (e.g. "gherkin_locked")
    phase_label: str = ""  # "Phase 1" / "Phase 2"
    reason: str = ""


class StoryIndexStatsResponse(BaseModel):
    total: int = 0
    phase2_designed: int = 0
    phase3_proposed: int = 0
    phase4_tested: int = 0
    phase4_passed: int = 0
    phase5_deployed: int = 0
    spec_drift: int = 0
    drifted_story_ids: list[int] = Field(default_factory=list)
    conformance_regressed: int = 0
    regressed_story_ids: list[int] = Field(default_factory=list)
    trace_flagged: int = 0
    trace_story_ids: list[int] = Field(default_factory=list)
    trace_flags: list["TraceFlagInfo"] = Field(default_factory=list)
