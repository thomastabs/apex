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


class CrossCheckEndpointsRequest(BaseModel):
    ux_brief: str = Field("", max_length=20_000)


class DesignSectionResponse(BaseModel):
    section: str
    content: str
    story_ids: list[int] = Field(default_factory=list)


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
