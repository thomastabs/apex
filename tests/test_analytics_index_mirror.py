"""Analytics N+1 kill: conformance score + verification completeness are mirrored
into story-index at save time, so the summary reads the single index file instead
of an O(stories) fan-out of per-story JSON reads on the File Share."""

import pytest

from backend.app.services.analytics_service import AnalyticsService


def test_save_conformance_mirrors_score_into_index(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="S")
    context_manager.save_conformance(10, {"score": 80, "endpoints": []})
    assert context_manager.get_story_index()["10"]["conformance_score"] == 80


def test_save_verification_mirrors_complete_into_index(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(11, phase_status="deployed", title="S")
    context_manager.save_verification(11, {"complete": True})
    assert context_manager.get_story_index()["11"]["verification_complete"] is True


def test_record_task_bolt_status_persists_under_story_entry(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="S")
    record = context_manager.record_task_bolt_status(10, 1, "pushed")
    assert record["status"] == "pushed"
    assert context_manager.get_story_index()["10"]["bolts"]["1"]["status"] == "pushed"


def test_record_task_bolt_status_requires_existing_story(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    with pytest.raises(ValueError):
        context_manager.record_task_bolt_status(999, 1, "pushed")


def test_save_proposal_records_pack_ready_bolt_status(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="S")
    context_manager.save_proposal(10, 1, "## Context\nHello.")
    assert context_manager.get_story_index()["10"]["bolts"]["1"]["status"] == "pack_ready"


def test_list_all_bolts_enriches_with_story_title_and_epic(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="Login", epic_title="Auth")
    context_manager.record_task_bolt_status(10, 1, "pack_ready")
    context_manager.record_task_bolt_status(10, 1, "done")
    bolts = context_manager.list_all_bolts()
    assert len(bolts) == 1
    assert bolts[0]["story_id"] == 10
    assert bolts[0]["story_title"] == "Login"
    assert bolts[0]["epic_title"] == "Auth"
    assert bolts[0]["task_id"] == 1
    assert bolts[0]["status"] == "done"
    assert bolts[0]["cycle_hours"] is not None


def test_list_all_bolts_empty_when_no_stories_have_bolts(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    context_manager.upsert_story_index(10, phase_status="implementation", title="Login")
    assert context_manager.list_all_bolts() == []


def test_bolt_config_round_trips_and_defaults_blank_labels(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    assert context_manager.get_project_bolt_config() == {}
    saved = context_manager.save_project_bolt_config({
        "labels": {"pack_ready": "Ready", "pushed": "", "done": "Shipped"},
        "cycle_time_threshold_hours": 6,
    })
    assert saved["labels"] == {"pack_ready": "Ready", "pushed": "Pushed", "done": "Shipped"}
    assert saved["cycle_time_threshold_hours"] == 6.0
    assert context_manager.get_project_bolt_config() == saved


def test_bolt_config_clears_non_positive_threshold(ctx):
    from src import context_manager

    ctx.set_active_project(1)
    saved = context_manager.save_project_bolt_config({"labels": {}, "cycle_time_threshold_hours": -3})
    assert saved["cycle_time_threshold_hours"] is None


def test_conformance_uses_index_score_without_reading_files():
    class NoFileCtx:
        def load_conformance(self, story_id):  # pragma: no cover - must not run
            raise AssertionError("fast path must not read the conformance file")

    svc = AnalyticsService(context=NoFileCtx())
    entries = [
        {"story_id": 1, "phase_status": "deployed", "conformance_score": 90},
        {"story_id": 2, "phase_status": "deployed", "conformance_score": 70},
    ]
    assert svc._conformance(entries) == {"eligible": 2, "checked": 2, "avg_score": 80.0}


def test_story_risk_scores_from_logged_signals():
    svc = AnalyticsService(context=None)
    # 2 fix-bolts (+2) + low conformance (+2) = 4 → medium
    medium = svc._story_risk(
        {"fix_bolt_count": 2, "conformance_score": 60, "phase_status": "qa"},
        total_hours=None, cycle_threshold=None,
    )
    assert medium["level"] == "medium" and medium["score"] == 4
    assert any("Fix-Bolt" in r for r in medium["reasons"])

    # 1 fix-bolt (+1) only → low
    low = svc._story_risk({"fix_bolt_count": 1, "phase_status": "qa"}, None, None)
    assert low["level"] == "low" and low["score"] == 1

    # clean story → none
    none = svc._story_risk({"fix_bolt_count": 0, "phase_status": "deployed"}, None, None)
    assert none["level"] == "none" and none["reasons"] == []


def test_story_risk_flags_slow_cycle_against_cohort():
    svc = AnalyticsService(context=None)
    r = svc._story_risk({"phase_status": "qa"}, total_hours=100.0, cycle_threshold=40.0)
    assert r["score"] == 1 and "slow cycle (> cohort p90)" in r["reasons"]
    r2 = svc._story_risk({"phase_status": "qa"}, total_hours=10.0, cycle_threshold=40.0)
    assert r2["score"] == 0


def test_conformance_falls_back_to_file_when_index_lacks_score():
    class FileCtx:
        def load_conformance(self, story_id):
            return {"score": 55} if story_id == 1 else None

    svc = AnalyticsService(context=FileCtx())
    entries = [
        {"story_id": 1, "phase_status": "deployed"},  # no mirrored score → file read
        {"story_id": 2, "phase_status": "deployed"},  # no report at all
    ]
    assert svc._conformance(entries) == {"eligible": 2, "checked": 1, "avg_score": 55.0}
