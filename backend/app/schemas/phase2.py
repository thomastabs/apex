"""Request and response schemas for Phase 2 design endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class TechStackStatusResponse(BaseModel):
    defined: bool
    tech_stack: str | None = None


class ArchitectureAlternativeSchema(BaseModel):
    name: str
    description: str
    trade_offs: str


class ProposeTechStackRequest(BaseModel):
    hint: str = Field("", max_length=2_000)


class ProposeTechStackResponse(BaseModel):
    alternatives: list[ArchitectureAlternativeSchema]


class LockTechStackRequest(BaseModel):
    tech_stack: str = Field(..., max_length=10_000)


class DesignSectionRequest(BaseModel):
    section: Literal["ux_brief", "endpoints", "data_model"]
    prior: dict[str, str] = Field(default_factory=dict)
    instructions: str = Field("", max_length=2_000)


class CrossCheckEndpointsRequest(BaseModel):
    ux_brief: str = Field("", max_length=20_000)
    alt_model: str = Field("", max_length=100)


class AssumptionEntry(BaseModel):
    id: str
    text: str


class DesignSectionResponse(BaseModel):
    section: str
    content: str
    story_ids: list[int] = Field(default_factory=list)
    assumptions: list[AssumptionEntry] = Field(default_factory=list)


class DesignBundleResponse(BaseModel):
    ux_brief: str = ""
    endpoints: str = ""
    data_model: str = ""


class LockDesignRequest(BaseModel):
    story_ids: list[int] = Field(min_length=1)
    ux_brief: str = Field(min_length=1, max_length=100_000)
    endpoints: str = Field(min_length=1, max_length=100_000)
    data_model: str = Field(min_length=1, max_length=100_000)


class TaigaTransitionFailure(BaseModel):
    story_id: int
    error: str


class LockDesignResponse(BaseModel):
    ok: bool
    story_ids: list[int]
    taiga_failures: list[TaigaTransitionFailure] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Design Delta schemas — additive design for stories pushed after the lock
# ---------------------------------------------------------------------------

class PendingDeltaStory(BaseModel):
    story_id: int
    epic_id: int | None = None
    epic_title: str = ""
    title: str = ""


class DesignDeltaStatusResponse(BaseModel):
    design_locked: bool
    pending: list[PendingDeltaStory] = Field(default_factory=list)


class GenerateDesignDeltaRequest(BaseModel):
    story_ids: list[int] = Field(default_factory=list)
    instructions: str = Field("", max_length=2_000)


class DesignDeltaResponse(BaseModel):
    ux_brief_addendum: str = ""
    endpoints_delta: str = ""
    data_model_delta: str = ""
    touches_existing: list[str] = Field(default_factory=list)
    story_ids: list[int] = Field(default_factory=list)


class PersistDesignDeltaRequest(BaseModel):
    story_ids: list[int] = Field(min_length=1)
    ux_brief_addendum: str = Field("", max_length=100_000)
    endpoints_delta: str = Field("", max_length=100_000)
    data_model_delta: str = Field("", max_length=100_000)
    touches_existing: list[str] = Field(default_factory=list)
    note: str = Field("", max_length=2_000)


class PersistDesignDeltaResponse(BaseModel):
    ok: bool
    story_ids: list[int] = Field(default_factory=list)
    versions: dict[str, str] = Field(default_factory=dict)
    amended: bool = False
    affected_story_ids: list[int] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# ER Diagram schemas
# ---------------------------------------------------------------------------

class GenerateDiagramRequest(BaseModel):
    data_model_md: str = Field(min_length=1, max_length=100_000)


class DiagramNodeData(BaseModel):
    label: str
    fields: list[dict]


class DiagramNode(BaseModel):
    id: str
    type: str = "entity"
    position: dict
    data: DiagramNodeData


class DiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    animated: bool = False


class DiagramResponse(BaseModel):
    nodes: list[DiagramNode]
    edges: list[DiagramEdge]


class SaveDiagramPositionsRequest(BaseModel):
    nodes: list[dict]


# ---------------------------------------------------------------------------
# Screen Flow schemas
# ---------------------------------------------------------------------------

class GenerateScreenFlowRequest(BaseModel):
    ux_brief_md: str = Field(min_length=1, max_length=100_000)


class ScreenFlowNodeData(BaseModel):
    label: str
    description: str = ""


class ScreenFlowNode(BaseModel):
    id: str
    type: str = "screen"
    position: dict
    data: ScreenFlowNodeData


class ScreenFlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    animated: bool = False


class ScreenFlowResponse(BaseModel):
    nodes: list[ScreenFlowNode]
    edges: list[ScreenFlowEdge]


class SaveScreenFlowPositionsRequest(BaseModel):
    nodes: list[dict]


class FigmaScreenFrame(BaseModel):
    node_id: str = Field(max_length=100)
    name: str = Field(max_length=300)
    page: str = Field("", max_length=300)


class FigmaScreenFlowEdge(BaseModel):
    from_name: str = Field(max_length=300)
    to_name: str = Field(max_length=300)


class ScreenFlowFromFigmaRequest(BaseModel):
    frames: list[FigmaScreenFrame] = Field(default_factory=list, max_length=300)
    flows: list[FigmaScreenFlowEdge] = Field(default_factory=list, max_length=600)


# ---------------------------------------------------------------------------
# Design System schemas
# ---------------------------------------------------------------------------

class GenerateDesignSystemRequest(BaseModel):
    ux_brief_md: str = Field(min_length=1, max_length=100_000)
    instructions: str = Field("", max_length=2_000)


class GenerateDesignSystemScreenRequest(BaseModel):
    ux_brief_md: str = Field(min_length=1, max_length=100_000)
    screen_id: str | None = Field(default=None, max_length=100)
    instructions: str = Field("", max_length=2_000)


class DesignSystemColorOut(BaseModel):
    name: str
    hex: str
    usage: str = ""


class TypographyStyleOut(BaseModel):
    role: str
    size_px: int
    weight: int
    line_height: float = 1.4


class TypographyScaleOut(BaseModel):
    font_family: str
    styles: list[TypographyStyleOut]


class NavigationPatternOut(BaseModel):
    pattern: Literal["topbar", "sidebar", "tabs", "bottom_nav"]
    items: list[str]
    justification: str


class ScreenBlockOut(BaseModel):
    kind: str
    label: str = ""
    variant: str = ""
    children: list["ScreenBlockOut"] = Field(default_factory=list)


ScreenBlockOut.model_rebuild()


class DesignSystemScreenOut(BaseModel):
    id: str
    label: str
    archetype: str
    blocks: list[ScreenBlockOut]


class ComponentStateStyleOut(BaseModel):
    background: str
    text_color: str
    border: str = ""
    opacity: float = 1.0
    note: str = ""


class ComponentStatesOut(BaseModel):
    component: Literal["button", "input", "card"]
    default: ComponentStateStyleOut
    hover: ComponentStateStyleOut
    disabled: ComponentStateStyleOut
    error: ComponentStateStyleOut


class DesignSystemResponse(BaseModel):
    colors: list[DesignSystemColorOut]
    typography: TypographyScaleOut
    navigation: NavigationPatternOut
    screens: list[DesignSystemScreenOut]
    component_states: list[ComponentStatesOut]
