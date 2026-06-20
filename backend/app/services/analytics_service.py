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

        conformance = self._conformance(entries)

        fix_bolts = [int(e.get("fix_bolt_count", 0)) for e in entries]
        affected = sum(1 for n in fix_bolts if n > 0)
        defects = {
            "total_fix_bolts": sum(fix_bolts),
            "stories_affected": affected,
            "avg_per_story": round(sum(fix_bolts) / len(entries), 2) if entries else 0.0,
        }

        # Cohort p90 of total cycle time — a story slower than this is flagged.
        # Needs a handful of completed samples to be a meaningful threshold.
        cohort_hours = [h for e in entries if (h := self._total_cycle_hours(e)) is not None]
        cycle_threshold = _p90(cohort_hours) if len(cohort_hours) >= 4 else None

        stories = sorted(
            (self._story_row(e, complete_by_id, cycle_threshold) for e in entries if e.get("story_id")),
            key=lambda r: r["story_id"],
        )
        return {
            "funnel": funnel,
            "cycle_times": cycle_times,
            "traceability": traceability,
            "conformance": conformance,
            "defects": defects,
            "stories": stories,
        }

    # Stories are eligible for a spec↔code conformance check from implementation on.
    _CONFORMANCE_STATUSES = ("implementation", "qa", "qa_passed", "deployed")

    def _conformance(self, entries: list[dict]) -> dict:
        """Spec Conformance Rate: average conformance score over implemented
        stories that have a saved report. Reports are produced by Phase 6."""
        eligible = [e for e in entries if e.get("phase_status") in self._CONFORMANCE_STATUSES]
        scores: list[int] = []
        for e in eligible:
            story_id = e.get("story_id")
            if story_id is None:
                continue
            # Fast path: score mirrored into the index at save time (no file read).
            cached = e.get("conformance_score")
            if isinstance(cached, int):
                scores.append(cached)
                continue
            # Fallback for indexes rebuilt before the mirror existed.
            report = self.context.load_conformance(story_id)
            if report and isinstance(report.get("score"), int):
                scores.append(report["score"])
        return {
            "eligible": len(eligible),
            "checked": len(scores),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0.0,
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
        # Fast path: completeness mirrored into the index at save time (no file read).
        if "verification_complete" in entry:
            return bool(entry["verification_complete"])
        # Fallback for indexes rebuilt before the mirror existed.
        verification = self.context.load_verification(story_id)
        return bool(verification and verification.get("complete"))

    def _total_cycle_hours(self, entry: dict) -> float | None:
        history = entry.get("status_history") or {}
        first = _earliest(history, "gherkin_locked")
        current = entry.get("phase_status", "")
        last = _latest(history, current) if current else None
        if first and last and last >= first:
            return round((last - first).total_seconds() / 3600, 2)
        return None

    def _story_risk(self, entry: dict, total_hours: float | None,
                    cycle_threshold: float | None) -> dict:
        """Deterministic, explainable risk score from already-logged signals —
        a forecast of QA-failure / spec-drift likelihood, not an AI guess."""
        score = 0
        reasons: list[str] = []

        fb = int(entry.get("fix_bolt_count", 0))
        if fb >= 2:
            score += 2
            reasons.append(f"{fb} Fix-Bolts — defect-prone")
        elif fb == 1:
            score += 1
            reasons.append("1 Fix-Bolt logged")

        if entry.get("spec_drift"):
            score += 2
            reasons.append("spec drifted after lock")

        if entry.get("has_bug_report") and entry.get("phase_status") == "implementation":
            score += 1
            reasons.append("regression bypass in progress")

        cs = entry.get("conformance_score")
        if isinstance(cs, int):
            if cs < 70:
                score += 2
                reasons.append(f"low spec conformance ({cs}%)")
            elif cs < 85:
                score += 1
                reasons.append(f"moderate spec conformance ({cs}%)")

        if cycle_threshold is not None and total_hours is not None and total_hours > cycle_threshold:
            score += 1
            reasons.append("slow cycle (> cohort p90)")

        level = "high" if score >= 5 else "medium" if score >= 3 else "low" if score >= 1 else "none"
        return {"level": level, "score": score, "reasons": reasons}

    def _story_row(self, entry: dict, complete_by_id: dict[int, bool],
                   cycle_threshold: float | None = None) -> dict:
        total_hours = self._total_cycle_hours(entry)
        return {
            "story_id": entry.get("story_id"),
            "title": entry.get("title", ""),
            "epic_title": entry.get("epic_title", ""),
            "phase_status": entry.get("phase_status", ""),
            "fix_bolt_count": int(entry.get("fix_bolt_count", 0)),
            "total_cycle_hours": total_hours,
            "artifact_complete": complete_by_id.get(entry.get("story_id"), False),
            "risk": self._story_risk(entry, total_hours, cycle_threshold),
        }
