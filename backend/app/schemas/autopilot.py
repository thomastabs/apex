"""Pydantic schemas for the Autopilot API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AutopilotState = Literal["running", "paused", "stopped", "done", "error"]
AutopilotPhase = Literal["init", "phase1", "phase2", "phase3", "phase4", "phase5", "done"]
EventLevel = Literal["info", "success", "warning", "error", "checkpoint"]


class AutopilotEpic(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""


class AutopilotSettings(BaseModel):
    pause_at_checkpoints: bool = True
    create_epics_in_taiga: bool = False


class AutopilotStartRequest(BaseModel):
    concept: str = Field(min_length=1)
    epics: list[AutopilotEpic] = Field(min_length=1)
    tech_stack_hint: str = ""
    settings: AutopilotSettings = Field(default_factory=AutopilotSettings)
    # Optional Figma seeding: design context injected into Phase 1/2 + a real
    # screen-flow built from frames. The token is held in-memory for the job only.
    figma_file_key: str = Field("", max_length=128)
    figma_token: str = Field("", max_length=2_000)


class AutopilotEvent(BaseModel):
    id: int
    ts: float
    level: EventLevel
    msg: str
    phase: str = ""
    artifact: str = ""


class AutopilotStatusResponse(BaseModel):
    job_id: str
    state: AutopilotState
    current_phase: AutopilotPhase
    current_epic_idx: int | None = None
    current_story_id: int | None = None
    events: list[AutopilotEvent]
    error: str | None = None
    story_count: int = 0
    stories_done: int = 0
    checkpoint_phase: str | None = None


class AutopilotStartResponse(BaseModel):
    job_id: str


class AutopilotControlResponse(BaseModel):
    ok: bool
    state: AutopilotState
