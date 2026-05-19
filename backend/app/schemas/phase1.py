"""Request and response schemas for Phase 1 requirements endpoints."""

from pydantic import BaseModel, Field


class EpicSchema(BaseModel):
    id: int
    ref: int
    subject: str
    description: str = ""
    version: int | None = None
    tags: list[str] = Field(default_factory=list)


class EpicSuggestionSchema(BaseModel):
    title: str
    description: str


class SuggestEpicsRequest(BaseModel):
    hint: str = ""


class SuggestEpicsResponse(BaseModel):
    epics: list[EpicSuggestionSchema]


class GenerateNlStoriesRequest(BaseModel):
    epic_subject: str
    epic_description: str = ""
    hint: str = ""


class GenerateNlStoriesResponse(BaseModel):
    nl_draft: str
    story_count: int


class CompileGherkinRequest(BaseModel):
    nl_draft: str


class CompiledStorySchema(BaseModel):
    title: str
    size: str
    gherkin: str


class CompileGherkinResponse(BaseModel):
    stories: list[CompiledStorySchema]


class PushStoriesRequest(BaseModel):
    epic_subject: str = ""
    epic_description: str = ""
    epic_id: int | None = None
    stories: list[CompiledStorySchema]


class PushStoriesResponse(BaseModel):
    ok: bool
    epic_id: int
    count: int
    story_ids: list[int]
    story_urls: list[str] = Field(default_factory=list)
