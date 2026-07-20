"""Tests for the governance analytics service and route error mapping."""

import json

import pytest
from fastapi import HTTPException

from backend.app.api.analytics import analytics_summary
from backend.app.services.analytics_service import AnalyticsService
from backend.app.services.request_context import RequestContext


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


class FakeContextService:
    def __init__(self, index=None, deployment_log="", verifications=None, conformances=None):
        self.index = index or {}
        self.deployment_log = deployment_log
        self.verifications = verifications or {}
        self.conformances = conformances or {}
        self.verification_reads: list[int] = []

    def set_active(self, ctx):
        self.set_project(ctx.project_id)

    def set_project(self, project_id: int):
        pass

    def story_index(self):
        return self.index

    def read_context_file(self, filename: str) -> str:
        assert filename == "deployment-log.md"
        return self.deployment_log

    def load_verification(self, story_id: int):
        self.verification_reads.append(story_id)
        return self.verifications.get(story_id)

    def load_conformance(self, story_id: int):
        return self.conformances.get(story_id)


def _entry(story_id, status, history=None, **extra):
    e = {
        "story_id": story_id,
        "title": f"Story {story_id}",
        "epic_title": "Auth",
        "phase_status": status,
        "has_gherkin": True,
        "has_bdd": False,
        "has_infra_delta": False,
        "fix_bolt_count": 0,
        "status_history": history or {},
    }
    e.update(extra)
    return e


def test_story_risk_flags_conformance_regression():
    svc = AnalyticsService(context=FakeContextService(index={}))
    risk = svc._story_risk(
        _entry(1, "deployed", conformance_regressed=True), None, None)
    assert "conformance regressed after code change" in risk["reasons"]
    assert risk["score"] >= 2 and risk["level"] in ("low", "medium", "high")
    # not flagged when the field is absent/false
    clean = svc._story_risk(_entry(2, "deployed"), None, None)
    assert all("regressed" not in r for r in clean["reasons"])


def test_story_risk_flags_backward_trace():
    svc = AnalyticsService(context=FakeContextService(index={}))
    risk = svc._story_risk(
        _entry(1, "deployed", trace_flag=True, trace_phase="gherkin_locked"), None, None)
    assert any("backward trace" in r and "Phase 1" in r for r in risk["reasons"])
    assert risk["score"] >= 1
    clean = svc._story_risk(_entry(2, "deployed"), None, None)
    assert all("backward trace" not in r for r in clean["reasons"])


def test_funnel_counts_all_statuses():
    index = {
        "1": _entry(1, "gherkin_locked"),
        "2": _entry(2, "qa_passed"),
        "3": _entry(3, "deployed"),
        "4": _entry(4, "deployed"),
    }
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["funnel"]["gherkin_locked"] == 1
    assert summary["funnel"]["deployed"] == 2
    assert summary["funnel"]["implementation"] == 0


def test_conformance_avg_score_over_checked_stories():
    index = {
        "1": _entry(1, "implementation"),  # checked, score 80
        "2": _entry(2, "qa"),              # checked, score 40
        "3": _entry(3, "deployed"),        # eligible, no report
        "4": _entry(4, "design_locked"),   # not eligible
    }
    conformances = {1: {"score": 80}, 2: {"score": 40}}
    summary = AnalyticsService(
        context=FakeContextService(index=index, conformances=conformances)
    ).summary(_ctx())
    c = summary["conformance"]
    assert c["eligible"] == 3
    assert c["checked"] == 2
    assert c["avg_score"] == 60.0


def test_conformance_zero_when_none_checked():
    index = {"1": _entry(1, "design_locked"), "2": _entry(2, "gherkin_locked")}
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["conformance"] == {"eligible": 0, "checked": 0, "avg_score": 0.0}


def test_cycle_times_median_and_samples():
    h1 = {
        "gherkin_locked": ["2026-06-01T00:00:00+00:00"],
        "design_locked": ["2026-06-01T12:00:00+00:00"],  # 12h
    }
    h2 = {
        "gherkin_locked": ["2026-06-02T00:00:00+00:00"],
        "design_locked": ["2026-06-03T00:00:00+00:00"],  # 24h
    }
    index = {"1": _entry(1, "design_locked", h1), "2": _entry(2, "design_locked", h2)}
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    stat = next(s for s in summary["cycle_times"] if s["transition"] == "gherkin_locked → design_locked")
    assert stat["samples"] == 2
    assert stat["median_hours"] == 18.0
    assert stat["p90_hours"] == 24.0


def test_cycle_times_use_latest_reentry():
    # Fix-Bolt loop: second implementation entry pushes the clock forward
    history = {
        "implementation": ["2026-06-01T00:00:00+00:00", "2026-06-05T00:00:00+00:00"],
        "qa": ["2026-06-05T06:00:00+00:00"],
    }
    index = {"1": _entry(1, "qa", history)}
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    stat = next(s for s in summary["cycle_times"] if s["transition"] == "implementation → qa")
    assert stat["median_hours"] == 6.0


def test_bolt_cycle_time_median_and_samples():
    index = {
        "1": _entry(1, "implementation", bolts={
            "1": {"status_history": {"pack_ready": ["2026-06-01T00:00:00+00:00"], "done": ["2026-06-01T06:00:00+00:00"]}},  # 6h
            "2": {"status_history": {"pack_ready": ["2026-06-01T00:00:00+00:00"], "done": ["2026-06-01T12:00:00+00:00"]}},  # 12h
        }),
    }
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    stat = summary["bolt_cycle_time"]
    assert stat["samples"] == 2
    assert stat["median_hours"] == 9.0
    assert stat["p90_hours"] == 12.0


def test_bolt_cycle_time_ignores_tasks_not_done():
    index = {
        "1": _entry(1, "implementation", bolts={
            "1": {"status_history": {"pack_ready": ["2026-06-01T00:00:00+00:00"]}},
        }),
    }
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["bolt_cycle_time"] == {"median_hours": 0.0, "p90_hours": 0.0, "samples": 0}


def test_traceability_rate_over_deployed():
    log = (
        "# Deployment Log\n\n"
        "## Deployment — Story 1 — 2026-06-10T00:00:00+00:00\n\n- ok\n"
        "## Deployment — Story 2 — 2026-06-11T00:00:00+00:00\n\n- ok\n"
    )
    index = {
        "1": _entry(1, "deployed", has_bdd=True, has_infra_delta=True),
        "2": _entry(2, "deployed", has_bdd=True, has_infra_delta=True),
        "3": _entry(3, "qa_passed"),
    }
    verifications = {1: {"complete": True}, 2: {"complete": False}}
    svc = AnalyticsService(context=FakeContextService(
        index=index, deployment_log=log, verifications=verifications,
    ))
    summary = svc.summary(_ctx())
    assert summary["traceability"] == {"deployed": 2, "complete": 1, "rate": 0.5}


def test_traceability_requires_log_entry():
    index = {"1": _entry(1, "deployed", has_bdd=True, has_infra_delta=True)}
    svc = AnalyticsService(context=FakeContextService(
        index=index, deployment_log="", verifications={1: {"complete": True}},
    ))
    assert svc.summary(_ctx())["traceability"]["complete"] == 0


def test_defect_proxy_stats():
    index = {
        "1": _entry(1, "deployed", fix_bolt_count=2),
        "2": _entry(2, "qa", fix_bolt_count=0),
        "3": _entry(3, "qa_passed", fix_bolt_count=1),
    }
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["defects"] == {"total_fix_bolts": 3, "stories_affected": 2, "avg_per_story": 1.0}


def test_story_rows_total_cycle_hours():
    history = {
        "gherkin_locked": ["2026-06-01T00:00:00+00:00"],
        "deployed": ["2026-06-03T00:00:00+00:00"],
    }
    index = {"1": _entry(1, "deployed", history)}
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["stories"][0]["total_cycle_hours"] == 48.0


def test_empty_index_yields_zeroes():
    summary = AnalyticsService(context=FakeContextService()).summary(_ctx())
    assert summary["cycle_times"] == []
    assert summary["traceability"]["rate"] == 0.0
    assert summary["stories"] == []


def test_malformed_timestamps_skipped():
    history = {"gherkin_locked": ["not-a-date"], "design_locked": ["2026-06-01T00:00:00+00:00"]}
    index = {"1": _entry(1, "design_locked", history)}
    summary = AnalyticsService(context=FakeContextService(index=index)).summary(_ctx())
    assert summary["cycle_times"] == []


def test_verification_read_once_per_deployed_story():
    log = (
        "## Deployment — Story 1 — 2026-06-10T00:00:00+00:00\n"
        "## Deployment — Story 2 — 2026-06-11T00:00:00+00:00\n"
    )
    index = {
        "1": _entry(1, "deployed", has_bdd=True, has_infra_delta=True),
        "2": _entry(2, "deployed", has_bdd=True, has_infra_delta=True),
        "3": _entry(3, "qa_passed"),
    }
    fake = FakeContextService(
        index=index, deployment_log=log,
        verifications={1: {"complete": True}, 2: {"complete": True}},
    )
    summary = AnalyticsService(context=fake).summary(_ctx())
    assert sorted(fake.verification_reads) == [1, 2]
    assert summary["traceability"]["complete"] == 2
    assert [r["artifact_complete"] for r in summary["stories"]] == [True, True, False]


# ---------------------------------------------------------------------------
# route error mapping
# ---------------------------------------------------------------------------

class _BrokenService:
    def __init__(self, exc: Exception):
        self.exc = exc

    def summary(self, ctx):
        raise self.exc


def test_route_maps_corrupt_index_to_clean_500():
    exc = json.JSONDecodeError("Expecting value", "{", 0)
    with pytest.raises(HTTPException) as exc_info:
        analytics_summary(ctx=_ctx(), service=_BrokenService(exc))
    assert exc_info.value.status_code == 500
    assert "Story index is corrupt" in exc_info.value.detail


def test_route_maps_storage_failure_to_502():
    with pytest.raises(HTTPException) as exc_info:
        analytics_summary(ctx=_ctx(), service=_BrokenService(OSError("share unreachable")))
    assert exc_info.value.status_code == 502
