"""Shared request schema for editable AI grounding file pickers."""

from pydantic import BaseModel, Field


class ExtraContextMixin(BaseModel):
    extra_context_files: list[str] = Field(default_factory=list, max_length=12)
