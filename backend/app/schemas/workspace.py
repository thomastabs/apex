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
    version: str = "0.0.0"


class ContextFilesResponse(BaseModel):
    files: list[ContextFileSchema]
    total_chars: int


class UpdateContextFileRequest(BaseModel):
    content: str = Field(..., max_length=5_242_880)  # 5 MB
    note: str = Field("", max_length=500)


class AmendmentsResponse(BaseModel):
    amendments_md: str = ""


class SaveAiConfigRequest(BaseModel):
    model: str | None = Field(None, max_length=200)


class SaveAiKeyRequest(BaseModel):
    provider: str = Field(..., max_length=20)
    api_key: str = Field(..., min_length=1, max_length=2_000)


class AiKeyStatusResponse(BaseModel):
    ok: bool = True
    personal_providers: list[str] = Field(default_factory=list)


class SaveConfigRequest(BaseModel):
    project_id: int | None = None
    pm_tool: str | None = Field(None, max_length=20)
    taiga_url: str | None = Field(None, max_length=2_048)
    jira_base_url: str | None = Field(None, max_length=2_048)
    github_repo: str | None = Field(None, max_length=255)
    figma_file_key: str | None = Field(None, max_length=255)
    # Encrypted at rest (AI_KEY_ENCRYPTION_SECRET) — "" clears the saved value.
    # Never echoed back in ConfigResponse; see GithubPatResponse/FigmaTokenResponse.
    github_pat: str | None = Field(None, max_length=512)
    figma_token: str | None = Field(None, max_length=512)


class OkResponse(BaseModel):
    ok: bool = True


class GithubWebhookConfigResponse(BaseModel):
    instance_id: str
    secret: str
    configured: bool = False


class GithubSyncStatusResponse(BaseModel):
    # When the push webhook last fired for this project (None = never, or no
    # webhook configured). Compared against context_synced_at by the frontend
    # to decide whether to auto-resync github-context.md.
    last_push_at: str | None = None
    # mtime of the saved github-context.md (None = never synced).
    context_synced_at: str | None = None


class ConfigResponse(BaseModel):
    project_id: int | None = None
    taiga_web_url: str = ""
    pm_tool: str = "taiga"
    pm_web_url: str = ""
    github_repo: str = ""
    figma_file_key: str = ""
    # Whether a PAT/token is saved server-side — never the credential itself.
    github_pat_configured: bool = False
    figma_token_configured: bool = False


class GithubPatResponse(BaseModel):
    pat: str = ""


class GithubPackConfigResponse(BaseModel):
    pack_detail_mode: Literal["auto", "full", "compress"] = "auto"
    # None = automatic sizing (scaled to remaining context headroom + the
    # configured AI model's window). A positive value overrides that sizing.
    pack_max_tokens: int | None = None
    # Extra --ignore globs (comma-separated), appended to the built-in list.
    pack_extra_ignore: str = ""


class SaveGithubPackConfigRequest(BaseModel):
    pack_detail_mode: Literal["auto", "full", "compress"] | None = None
    # <= 0 clears the override back to automatic sizing; omit the field
    # entirely (None) to leave whatever is currently saved untouched.
    pack_max_tokens: int | None = Field(None, ge=0, le=300_000)
    pack_extra_ignore: str | None = Field(None, max_length=4_000)


class FigmaTokenResponse(BaseModel):
    token: str = ""


class AiConfigModel(BaseModel):
    id: str
    label: str
    role: str = ""
    provider: str = "anthropic"
    note: str = ""
    context_window_tokens: int = 0


class AiConfigResponse(BaseModel):
    model: str
    available_models: list[AiConfigModel] = Field(default_factory=list)
    # Usable at all right now (system env var set, or a personal key saved).
    configured_providers: list[str] = Field(default_factory=list)
    # Deployment-wide key set via *_API_KEY env var — the "system key".
    system_providers: list[str] = Field(default_factory=list)
    # Has a personal key saved to *your* Taiga/Jira account (src/ai_key_store.py).
    # Always the active credential for that provider once saved — it takes
    # priority over the system key unconditionally.
    personal_providers: list[str] = Field(default_factory=list)


class TraceFlagInfo(BaseModel):
    story_id: int
    phase: str = ""        # phase_status to re-open (e.g. "gherkin_locked")
    phase_label: str = ""  # "Phase 1" / "Phase 2"
    reason: str = ""


class FigmaLinkInfo(BaseModel):
    story_id: int
    figma_node_id: str = ""
    figma_file_key: str = ""  # which file the node lives in; empty = configured single file


class SetStoryFigmaLinkRequest(BaseModel):
    figma_node_id: str = Field("", max_length=100)
    figma_modified: str = Field("", max_length=64)
    figma_file_key: str = Field("", max_length=128)


class SyncFigmaContextRequest(BaseModel):
    # The file to assemble figma-context.md from (Figma file keys are alphanumeric).
    figma_file_key: str = Field("", max_length=128, pattern=r"^[A-Za-z0-9]*$")


class ScanFigmaChangesRequest(BaseModel):
    current_modified: str = Field("", max_length=64)
    # Project mode: per-file current lastModified (file key → timestamp; "" key =
    # the configured single file). When present, drift is scanned per file.
    modified_by_file: dict[str, str] | None = None


class ScanFigmaChangesResponse(BaseModel):
    changed_story_ids: list[int] = Field(default_factory=list)


class AcknowledgeFigmaChangeRequest(BaseModel):
    current_modified: str = Field("", max_length=64)
    figma_file_key: str = Field("", max_length=128)


class StoryIndexStatsResponse(BaseModel):
    total: int = 0
    phase2_designed: int = 0
    phase3_proposed: int = 0
    phase4_tested: int = 0
    phase4_passed: int = 0
    phase5_deployed: int = 0
    conformance_regressed: int = 0
    regressed_story_ids: list[int] = Field(default_factory=list)
    trace_flagged: int = 0
    trace_story_ids: list[int] = Field(default_factory=list)
    trace_flags: list["TraceFlagInfo"] = Field(default_factory=list)
    figma_links: list["FigmaLinkInfo"] = Field(default_factory=list)
    figma_changed: int = 0
    figma_changed_story_ids: list[int] = Field(default_factory=list)


class ImportEpicSummary(BaseModel):
    id: int
    title: str
    story_count: int


class ImportStatusMapping(BaseModel):
    taiga_name: str
    apex_status: str


class ImportBootstrapResponse(BaseModel):
    imported: int
    skipped: int
    epics: list[ImportEpicSummary] = Field(default_factory=list)
    status_mapping: list[ImportStatusMapping] = Field(default_factory=list)


class ImportStoryResult(BaseModel):
    story_id: int
    status: str  # "ok" | "skipped"
    reason: str = ""


class ImportReconstructResponse(BaseModel):
    epic_id: int
    epic_title: str
    results: list[ImportStoryResult] = Field(default_factory=list)


class TraceNode(BaseModel):
    id: str
    type: Literal["project", "epic", "design", "story", "gherkin", "scenario", "tasks", "tests", "deploy", "figma"]
    label: str
    phase: int | None = None
    story_id: int | None = None
    phase_status: str | None = None
    scenario_count: int | None = None
    verified: bool | None = None
    figma_node_id: str | None = None
    flags: dict[str, bool] = Field(default_factory=dict)
    position: dict[str, float] | None = None


class TraceEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: Literal["derive", "design", "trace", "verify"]


class TraceabilityGraphResponse(BaseModel):
    nodes: list[TraceNode] = Field(default_factory=list)
    edges: list[TraceEdge] = Field(default_factory=list)


class TraceNodePosition(BaseModel):
    id: str
    x: float
    y: float


class SaveTraceLayoutRequest(BaseModel):
    nodes: list[TraceNodePosition] = Field(default_factory=list)
