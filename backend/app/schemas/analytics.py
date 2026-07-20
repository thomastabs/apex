"""Response schemas for the governance analytics endpoint."""

from pydantic import BaseModel, Field


class CycleTimeStat(BaseModel):
    transition: str
    median_hours: float
    p90_hours: float
    samples: int


class BoltCycleTimeStats(BaseModel):
    median_hours: float = 0.0
    p90_hours: float = 0.0
    samples: int = 0


class TraceabilityStats(BaseModel):
    deployed: int = 0
    complete: int = 0
    rate: float = 0.0


class ConformanceStats(BaseModel):
    eligible: int = 0
    checked: int = 0
    avg_score: float = 0.0


class DefectStats(BaseModel):
    total_fix_bolts: int = 0
    stories_affected: int = 0
    avg_per_story: float = 0.0


class StoryRisk(BaseModel):
    level: str = "none"  # none | low | medium | high
    score: int = 0
    reasons: list[str] = Field(default_factory=list)


class StoryAnalyticsRow(BaseModel):
    story_id: int
    title: str
    epic_title: str = ""
    phase_status: str
    fix_bolt_count: int = 0
    total_cycle_hours: float | None = None
    artifact_complete: bool = False
    risk: StoryRisk = Field(default_factory=StoryRisk)


class AnalyticsSummaryResponse(BaseModel):
    funnel: dict[str, int] = Field(default_factory=dict)
    cycle_times: list[CycleTimeStat] = Field(default_factory=list)
    bolt_cycle_time: BoltCycleTimeStats = Field(default_factory=BoltCycleTimeStats)
    traceability: TraceabilityStats = Field(default_factory=TraceabilityStats)
    conformance: ConformanceStats = Field(default_factory=ConformanceStats)
    defects: DefectStats = Field(default_factory=DefectStats)
    stories: list[StoryAnalyticsRow] = Field(default_factory=list)
