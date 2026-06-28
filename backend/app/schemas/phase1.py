"""Request and response schemas for Phase 1 requirements endpoints."""

from pydantic import BaseModel, Field


class EpicSuggestionSchema(BaseModel):
    title: str
    description: str


class SuggestEpicsRequest(BaseModel):
    hint: str = Field("", max_length=2_000)


class SuggestEpicsResponse(BaseModel):
    epics: list[EpicSuggestionSchema]


class ExistingEpicSchema(BaseModel):
    title: str = Field("", max_length=500)
    description: str = Field("", max_length=5_000)
    stories: list[str] = Field(default_factory=list, max_length=200)


class AnalyzeGapsRequest(BaseModel):
    existing_epics: list[ExistingEpicSchema] = Field(default_factory=list, max_length=200)
    hint: str = Field("", max_length=2_000)


class RequirementGapSchema(BaseModel):
    title: str
    kind: str
    importance: str = "medium"
    rationale: str
    suggested_stories: list[str] = Field(default_factory=list)


class AnalyzeGapsResponse(BaseModel):
    assessment: str
    gaps: list[RequirementGapSchema]


class GenerateNlStoriesRequest(BaseModel):
    epic_subject: str = Field(..., max_length=500)
    epic_description: str = Field("", max_length=5_000)
    hint: str = Field("", max_length=2_000)
    instructions: str = Field("", max_length=2_000)


class GenerateNlStoriesResponse(BaseModel):
    nl_draft: str
    story_count: int


class FigmaFrameSchema(BaseModel):
    name: str = Field(..., max_length=300)
    description: str = Field("", max_length=2_000)
    node_id: str = Field("", max_length=120)  # for U1 multimodal grounding (render this node)


class FigmaFlowSchema(BaseModel):
    from_name: str = Field(..., max_length=300)
    to_name: str = Field(..., max_length=300)


class GenerateStoriesFromFigmaRequest(BaseModel):
    frames: list[FigmaFrameSchema] = Field(default_factory=list, max_length=200)
    flows: list[FigmaFlowSchema] = Field(default_factory=list, max_length=400)
    instructions: str = Field("", max_length=2_000)
    file_key: str = Field("", max_length=128)  # enables server-side frame rendering (U1)


class CrossCheckRequest(BaseModel):
    epic_subject: str = Field(..., max_length=500)
    epic_description: str = Field("", max_length=5_000)
    hint: str = Field("", max_length=2_000)
    alt_model: str = Field("", max_length=100)


class CrossCheckScenario(BaseModel):
    story_title: str = ""
    title: str = ""
    description: str = ""


class CrossCheckResponse(BaseModel):
    primary_model: str
    primary_label: str
    alt_model: str
    alt_label: str
    agreed: list[str] = Field(default_factory=list)
    only_primary: list[CrossCheckScenario] = Field(default_factory=list)
    only_alt: list[CrossCheckScenario] = Field(default_factory=list)


class CompileGherkinRequest(BaseModel):
    nl_draft: str = Field(..., max_length=50_000)


class CompiledStorySchema(BaseModel):
    title: str
    size: str
    gherkin: str


class CompileGherkinResponse(BaseModel):
    stories: list[CompiledStorySchema]


class FinalizedStorySchema(BaseModel):
    id: int
    title: str
    gherkin: str


class FinalizeStoriesRequest(BaseModel):
    epic_id: int
    epic_subject: str = ""
    stories: list[FinalizedStorySchema]


class FinalizeStoriesResponse(BaseModel):
    ok: bool
    epic_id: int
    count: int
    story_ids: list[int]


class ConstraintSchema(BaseModel):
    id: str
    category: str
    ears_type: str
    text: str
    rationale: str = ""


class GenerateConstraintsResponse(BaseModel):
    constraints: list[ConstraintSchema]
    constraints_md: str


class SaveConstraintsRequest(BaseModel):
    constraints_md: str = Field(..., max_length=50_000)


class GetConstraintsResponse(BaseModel):
    constraints_md: str
