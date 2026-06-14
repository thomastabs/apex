"""Governance analytics computed from the story index and context artifacts.

Implements the framework's Core Governance Metrics on the data Apex already
records: Bolt Cycle Time from status_history timestamps, Context Traceability
Rate from artifact completeness of deployed stories, and the AI-defect proxy
from Fix-Bolt counts (Apex has no production telemetry, so QA-caught defects
are the honest measurable stand-in for the Defect Escape Rate).

Computed on demand — project scale is tens of stories, no caching needed.
"""

import logging
import math
import re
import statistics
from datetime import datetime

from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext
from src.context_manager import PHASE_STATUSES

_logger = logging.getLogger("apex.analytics_service")


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _earliest(history: dict, status: str) -> datetime | None:
    stamps = [t for t in (_parse_ts(v) for v in history.get(status, [])) if t]
    return min(stamps) if stamps else None


def _latest(history: dict, status: str) -> datetime | None:
    stamps = [t for t in (_parse_ts(v) for v in history.get(status, [])) if t]
    return max(stamps) if stamps else None


def _p90(values: list[float]) -> float:
    ordered = sorted(values)
    idx = max(0, math.ceil(0.9 * len(ordered)) - 1)
    return ordered[idx]


class AnalyticsService:
    def __init__(self, *, context: ContextService | None = None) -> None:
        self.context = context or ContextService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_active(ctx)

    def summary(self, ctx: RequestContext) -> dict:
        self.configure_request(ctx)
        index = self.context.story_index()
        entries = list(index.values())

        funnel = {status: 0 for status in PHASE_STATUSES}
        for e in entries:
            status = e.get("phase_status", "")
            if status in funnel:
                funnel[status] += 1

        cycle_times = self._cycle_times(entries)
        deployed_ids = self._deployment_log_story_ids()

        # One verification read per deployed story, shared by the traceability
        # aggregate and the per-story rows (the reads are network calls in
        # Azure mode).
        deployed = [e for e in entries if e.get("phase_status") == "deployed"]
        complete_by_id = {
            e.get("story_id"): self._artifact_complete(e, deployed_ids) for e in deployed
        }
        complete = sum(1 for done in complete_by_id.values() if done)
        traceability = {
            "deployed": len(deployed),
            "complete": complete,
            "rate": round(complete / len(deployed), 3) if deployed else 0.0,
        }

        fix_bolts = [int(e.get("fix_bolt_count", 0)) for e in entries]
        affected = sum(1 for n in fix_bolts if n > 0)
        defects = {
            "total_fix_bolts": sum(fix_bolts),
            "stories_affected": affected,
            "avg_per_story": round(sum(fix_bolts) / len(entries), 2) if entries else 0.0,
        }

        stories = sorted(
            (self._story_row(e, complete_by_id) for e in entries if e.get("story_id")),
            key=lambda r: r["story_id"],
        )
        return {
            "funnel": funnel,
            "cycle_times": cycle_times,
            "traceability": traceability,
            "defects": defects,
            "stories": stories,
        }

    def _cycle_times(self, entries: list[dict]) -> list[dict]:
        """Per canonical transition: earliest timestamp of the later status minus
        the latest of the earlier one (re-entries push the clock forward, which
        matches the lived cycle time of Fix-Bolt loops)."""
        out = []
        for earlier, later in zip(PHASE_STATUSES, PHASE_STATUSES[1:]):
            samples: list[float] = []
            for e in entries:
                history = e.get("status_history") or {}
                start = _latest(history, earlier)
                end = _earliest(history, later)
                if start and end and end >= start:
                    samples.append((end - start).total_seconds() / 3600)
            if samples:
                out.append({
                    "transition": f"{earlier} → {later}",
                    "median_hours": round(statistics.median(samples), 2),
                    "p90_hours": round(_p90(samples), 2),
                    "samples": len(samples),
                })
        return out

    def _deployment_log_story_ids(self) -> set[int]:
        log = self.context.read_context_file("deployment-log.md")
        return {int(m.group(1)) for m in re.finditer(r"^## Deployment — Story (\d+) —", log, re.MULTILINE)}

    def _artifact_complete(self, entry: dict, deployed_ids: set[int]) -> bool:
        story_id = entry.get("story_id")
        if not (entry.get("has_gherkin") and entry.get("has_bdd") and entry.get("has_infra_delta")):
            return False
        if story_id not in deployed_ids:
            return False
        verification = self.context.load_verification(story_id)
        return bool(verification and verification.get("complete"))

    def _story_row(self, entry: dict, complete_by_id: dict[int, bool]) -> dict:
        history = entry.get("status_history") or {}
        first = _earliest(history, "gherkin_locked")
        current = entry.get("phase_status", "")
        last = _latest(history, current) if current else None
        total_hours = None
        if first and last and last >= first:
            total_hours = round((last - first).total_seconds() / 3600, 2)
        return {
            "story_id": entry.get("story_id"),
            "title": entry.get("title", ""),
            "epic_title": entry.get("epic_title", ""),
            "phase_status": current,
            "fix_bolt_count": int(entry.get("fix_bolt_count", 0)),
            "total_cycle_hours": total_hours,
            "artifact_complete": complete_by_id.get(entry.get("story_id"), False),
        }
