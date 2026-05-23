"""Request and response schemas for Phase 1 requirements endpoints."""

from pydantic import BaseModel


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
