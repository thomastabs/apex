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
    hint: str = ""


class ProposeTechStackResponse(BaseModel):
    alternatives: list[ArchitectureAlternativeSchema]


class LockTechStackRequest(BaseModel):
    tech_stack: str


class DesignSectionRequest(BaseModel):
    section: Literal["ux_brief", "endpoints", "data_model"]
    prior: dict[str, str] = Field(default_factory=dict)


class DesignSectionResponse(BaseModel):
    section: str
    content: str
    story_ids: list[int] = Field(default_factory=list)


class LockDesignRequest(BaseModel):
    story_ids: list[int] = Field(min_length=1)
    ux_brief: str = Field(min_length=1)
    endpoints: str = Field(min_length=1)
    data_model: str = Field(min_length=1)


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
    data_model_md: str = Field(min_length=1)


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
