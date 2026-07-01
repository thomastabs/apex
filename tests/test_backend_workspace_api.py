"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import AuthContext
from backend.app.api.workspace import (
    delete_ai_key,
    get_ai_config,
    get_config,
    get_context_files,
    get_story_phase_status,
    log_decision,
    rebuild_story_index,
    remove_epic_from_story_index,
    remove_story_from_story_index,
    reset_context_file,
    save_ai_config_endpoint,
    save_ai_key,
    save_config,
    set_story_phase_status,
    story_index_stats,
    update_context_file,
)
from backend.app.schemas.workspace import (
    LogDecisionRequest,
    SaveAiConfigRequest,
    SaveAiKeyRequest,
    SaveConfigRequest,
    SetPhaseStatusRequest,
    UpdateContextFileRequest,
)
from backend.app.services.request_context import RequestContext

_AUTH = AuthContext(pm_token="tok")
_AUTH_WITH_ACCOUNT = AuthContext(pm_token="tok", account_id="42")


def test_story_index_stats_deployed_counts_only_explicit_deployed(monkeypatch):
    def set_active_project(project_id: int) -> None:
        assert project_id == 42

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr(
        "src.context_manager.get_story_index",
        lambda: {
            "1": {"has_tech_spec": True, "has_proposal": True, "has_bdd": True, "phase_status": "qa"},
            "2": {"has_tech_spec": True, "has_proposal": False, "has_bdd": False, "phase_status": "deployed"},
        },
    )

    stats = story_index_stats(RequestContext(pm_token="tok", project_id=42))

    assert stats == {
        "total": 2,
        "phase2_designed": 2,
        "phase3_proposed": 1,
        "phase4_tested": 1,
        "phase4_passed": 1,
        "phase5_deployed": 1,
        "spec_drift": 0,
        "drifted_story_ids": [],
        "conformance_regressed": 0,
        "regressed_story_ids": [],
        "trace_flagged": 0,
        "trace_story_ids": [],
        "trace_flags": [],
        "design_conflict": 0,
        "conflicted_story_ids": [],
        "conflict_flags": [],
        "figma_links": [],
        "figma_changed": 0,
        "figma_changed_story_ids": [],
    }


def test_remove_epic_from_story_index_uses_request_project(monkeypatch):
    calls: list[tuple[str, int]] = []

    def set_active_project(project_id: int) -> None:
        calls.append(("project", project_id))

    def remove_epic(epic_id: int) -> None:
        calls.append(("epic", epic_id))

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr("src.context_manager.remove_epic_from_story_index", remove_epic)

    response = remove_epic_from_story_index(7, RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("epic", 7)]


def test_remove_story_from_story_index_uses_request_project(monkeypatch):
    calls: list[tuple[str, int | list[int]]] = []

    def set_active_project(project_id: int) -> None:
        calls.append(("project", project_id))

    def remove_stories(story_ids: list[int]) -> None:
        calls.append(("stories", story_ids))

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr("src.context_manager.remove_story_index_entries", remove_stories)

    response = remove_story_from_story_index(11, RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("stories", [11])]


def test_get_story_phase_status_returns_entry_status(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {"5": {"phase_status": "qa"}})
    res = get_story_phase_status(5, RequestContext(pm_token="tok", project_id=42))
    assert res == {"phase_status": "qa"}


def test_get_story_phase_status_null_when_absent(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {})
    res = get_story_phase_status(9, RequestContext(pm_token="tok", project_id=42))
    assert res == {"phase_status": None}


def test_set_story_phase_status_upserts_when_in_index(monkeypatch):
    calls: list[tuple[int, dict]] = []
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {"5": {"phase_status": "implementation"}})
    monkeypatch.setattr("src.context_manager.upsert_story_index", lambda sid, **kw: calls.append((sid, kw)))
    res = set_story_phase_status(5, SetPhaseStatusRequest(phase_status="qa"), RequestContext(pm_token="tok", project_id=42))
    assert res == {"ok": True}
    assert calls == [(5, {"phase_status": "qa"})]


def test_set_story_phase_status_404_when_not_in_index(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {})
    monkeypatch.setattr("src.context_manager.upsert_story_index", lambda *a, **k: pytest.fail("should not upsert"))
    with pytest.raises(HTTPException) as ei:
        set_story_phase_status(9, SetPhaseStatusRequest(phase_status="qa"), RequestContext(pm_token="tok", project_id=42))
    assert ei.value.status_code == 404


# ── get_config ──────────────────────────────────────────────────────────────


def test_get_config_taiga_uses_taiga_web_url(monkeypatch):
    monkeypatch.setattr(
        "src.context_manager.load_config",
        lambda: {"project_id": 42, "pm_tool": "taiga", "github_repo": "owner/repo"},
    )
    monkeypatch.setattr("src.taiga_adapter.get_web_base_url", lambda: "https://taiga.example")
    # github_repo / figma_file_key are per-instance now — stub the instance lookups.
    monkeypatch.setattr("src.context_manager.get_instance_github_repo", lambda: "owner/repo")
    monkeypatch.setattr("src.context_manager.get_instance_figma_file_key", lambda: "FIGKEY")

    response = get_config(_AUTH)

    assert response == {
        "project_id": 42,
        "taiga_web_url": "https://taiga.example",
        "pm_tool": "taiga",
        "pm_web_url": "https://taiga.example",
        "github_repo": "owner/repo",
        "figma_file_key": "FIGKEY",
    }


def test_get_config_jira_uses_jira_web_url(monkeypatch):
    monkeypatch.setattr(
        "src.context_manager.load_config",
        lambda: {"project_id": 7, "pm_tool": "jira", "jira_base_url": "https://acme.atlassian.net"},
    )
    monkeypatch.setattr(
        "src.jira_adapter.get_web_base_url", lambda base: f"{base}/jira/software"
    )

    response = get_config(_AUTH)

    assert response["pm_tool"] == "jira"
    assert response["pm_web_url"] == "https://acme.atlassian.net/jira/software"
    assert response["taiga_web_url"] == "https://acme.atlassian.net/jira/software"


# ── save_ai_config ──────────────────────────────────────────────────────────


def test_save_ai_config_persists_valid_model(monkeypatch):
    saved: list[str] = []
    monkeypatch.setattr(
        "src.ai_engine.AVAILABLE_MODELS",
        [{"id": "claude-fable-5", "label": "Fable 5"}],
    )
    monkeypatch.setattr("src.context_manager.save_ai_config", lambda model: saved.append(model))
    monkeypatch.setattr("src.ai_engine._llm_cache", {"stale": object()})

    response = save_ai_config_endpoint(SaveAiConfigRequest(model="claude-fable-5"), _AUTH)

    assert response["model"] == "claude-fable-5"
    assert saved == ["claude-fable-5"]


def test_save_ai_config_rejects_unknown_model(monkeypatch):
    monkeypatch.setattr(
        "src.ai_engine.AVAILABLE_MODELS",
        [{"id": "claude-fable-5", "label": "Fable 5"}],
    )

    with pytest.raises(HTTPException) as exc_info:
        save_ai_config_endpoint(SaveAiConfigRequest(model="gpt-nonexistent"), _AUTH)

    assert exc_info.value.status_code == 400


# ── ai-config / ai-keys (bring-your-own AI provider key, per PM account) ──────


def test_get_ai_config_reports_env_and_personal_providers(monkeypatch):
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-env")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setattr(
        "src.ai_key_store.saved_providers", lambda instance_id, account_id: ["openai"]
    )

    response = get_ai_config(_AUTH_WITH_ACCOUNT)

    assert set(response["configured_providers"]) == {"anthropic", "openai"}
    assert response["system_providers"] == ["anthropic"]
    assert response["personal_providers"] == ["openai"]


def test_get_ai_config_personal_key_configured_even_alongside_system_key(monkeypatch):
    # A saved personal key is always active — a provider with BOTH a system
    # env var and a personal key must still report as configured (via the
    # personal key; ai_engine actually calling it is covered in test_ai_engine.py).
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-system-env")
    monkeypatch.setattr("src.ai_key_store.saved_providers", lambda instance_id, account_id: ["openai"])

    response = get_ai_config(_AUTH_WITH_ACCOUNT)

    assert "openai" in response["configured_providers"]
    assert response["system_providers"] == ["openai"]
    assert response["personal_providers"] == ["openai"]


def test_get_ai_config_no_account_id_reports_env_only(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-env")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    response = get_ai_config(_AUTH)  # account_id="" — never resolved this request

    assert response["configured_providers"] == ["anthropic"]
    assert response["system_providers"] == ["anthropic"]
    assert response["personal_providers"] == []


def test_save_ai_key_persists_and_clears_llm_cache(monkeypatch):
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")
    saved: list[tuple] = []
    monkeypatch.setattr(
        "src.ai_key_store.save_key",
        lambda instance_id, account_id, provider, api_key: saved.append((instance_id, account_id, provider, api_key)),
    )
    monkeypatch.setattr("src.ai_key_store.saved_providers", lambda instance_id, account_id: ["openai"])
    monkeypatch.setattr("src.ai_engine._llm_cache", {"stale": object()})

    response = save_ai_key(SaveAiKeyRequest(provider="openai", api_key="sk-my-key"), _AUTH_WITH_ACCOUNT)

    assert response == {"ok": True, "personal_providers": ["openai"]}
    assert saved == [("api_taiga_io", "42", "openai", "sk-my-key")]


def test_save_ai_key_rejects_unknown_provider(monkeypatch):
    with pytest.raises(HTTPException) as exc_info:
        save_ai_key(SaveAiKeyRequest(provider="not-a-provider", api_key="sk-x"), _AUTH_WITH_ACCOUNT)
    assert exc_info.value.status_code == 400


def test_save_ai_key_without_account_id_returns_503():
    with pytest.raises(HTTPException) as exc_info:
        save_ai_key(SaveAiKeyRequest(provider="openai", api_key="sk-x"), _AUTH)
    assert exc_info.value.status_code == 503


def test_save_ai_key_without_encryption_secret_returns_503(monkeypatch):
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")

    def _boom(instance_id, account_id, provider, api_key):
        raise RuntimeError("AI_KEY_ENCRYPTION_SECRET is not configured on this deployment.")

    monkeypatch.setattr("src.ai_key_store.save_key", _boom)

    with pytest.raises(HTTPException) as exc_info:
        save_ai_key(SaveAiKeyRequest(provider="openai", api_key="sk-x"), _AUTH_WITH_ACCOUNT)
    assert exc_info.value.status_code == 503


def test_delete_ai_key_removes_and_clears_llm_cache(monkeypatch):
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")
    deleted: list[tuple] = []
    monkeypatch.setattr(
        "src.ai_key_store.delete_key",
        lambda instance_id, account_id, provider: deleted.append((instance_id, account_id, provider)),
    )
    monkeypatch.setattr("src.ai_key_store.saved_providers", lambda instance_id, account_id: [])
    monkeypatch.setattr("src.ai_engine._llm_cache", {"stale": object()})

    response = delete_ai_key("openai", _AUTH_WITH_ACCOUNT)

    assert response == {"ok": True, "personal_providers": []}
    assert deleted == [("api_taiga_io", "42", "openai")]


def test_delete_ai_key_rejects_unknown_provider():
    with pytest.raises(HTTPException) as exc_info:
        delete_ai_key("not-a-provider", _AUTH_WITH_ACCOUNT)
    assert exc_info.value.status_code == 400


def test_delete_ai_key_without_account_id_is_a_noop(monkeypatch):
    monkeypatch.setattr("backend.app.api.workspace.anchor_instance_id", lambda override="": "api_taiga_io")
    called = []
    monkeypatch.setattr("src.ai_key_store.delete_key", lambda *a: called.append(a))

    response = delete_ai_key("openai", _AUTH)

    assert response == {"ok": True, "personal_providers": []}
    assert called == []


# ── save_config ─────────────────────────────────────────────────────────────


def test_save_config_persists_project_and_per_instance_github(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr("src.context_manager.save_config", lambda pid: calls.append(("project", pid)))
    # github_repo is now saved per-instance (not the legacy global save_github_config).
    monkeypatch.setattr(
        "src.context_manager.save_instance_github_repo", lambda repo: calls.append(("github", repo))
    )

    response = save_config(
        SaveConfigRequest(project_id=42, github_repo="owner/repo"), _AUTH
    )

    assert response == {"ok": True}
    assert calls == [("project", 42), ("github", "owner/repo")]


def test_save_config_validates_jira_base_url_against_ssrf(monkeypatch):
    validated: list[str] = []
    monkeypatch.setattr(
        "backend.app.api.jira_proxy.validate_jira_base_url",
        lambda url, source: validated.append(url),
    )
    monkeypatch.setattr(
        "src.context_manager.save_pm_config",
        lambda *, pm_tool, jira_base_url, taiga_url: None,
    )

    response = save_config(
        SaveConfigRequest(pm_tool="jira", jira_base_url="https://acme.atlassian.net"), _AUTH
    )

    assert response == {"ok": True}
    assert validated == ["https://acme.atlassian.net"]


def test_save_config_validates_and_saves_taiga_url(monkeypatch):
    validated: list[str] = []
    saved: list[tuple[str | None, str | None, str | None]] = []
    monkeypatch.setattr(
        "backend.app.api.taiga_proxy._validate_taiga_url",
        lambda url, source: validated.append(url),
    )
    monkeypatch.setattr(
        "src.context_manager.save_pm_config",
        lambda *, pm_tool, jira_base_url, taiga_url: saved.append((pm_tool, jira_base_url, taiga_url)),
    )

    response = save_config(
        SaveConfigRequest(pm_tool="taiga", taiga_url="https://private.example.org/api/v1", jira_base_url=""),
        _AUTH,
    )

    assert response == {"ok": True}
    assert validated == ["https://private.example.org/api/v1"]
    assert saved == [("taiga", "", "https://private.example.org/api/v1")]


# ── context-file routes: unknown filename guard ───────────────────────────────


def test_update_context_file_rejects_unknown_filename():
    with pytest.raises(HTTPException) as exc_info:
        update_context_file(
            "../../etc/passwd",
            UpdateContextFileRequest(content="x"),
            RequestContext(pm_token="tok", project_id=42),
        )

    assert exc_info.value.status_code == 404


def test_reset_context_file_rejects_unknown_filename():
    with pytest.raises(HTTPException) as exc_info:
        reset_context_file("unknown.md", RequestContext(pm_token="tok", project_id=42))

    assert exc_info.value.status_code == 404


# --- Controlled spec co-evolution (roadmap #4) -----------------------------

def test_update_context_file_returns_drift_on_post_lock_edit(ctx):
    ctx.upsert_story_index(1, phase_status="implementation")
    resp = update_context_file(
        "technical-spec.md",
        UpdateContextFileRequest(content="# edited spec", note="tighten auth"),
        RequestContext(pm_token="tok", project_id=ctx._get_project_id()),
    )
    assert resp["drift"]["amended"] is True
    assert resp["drift"]["affected_story_ids"] == [1]
    assert ctx.get_story_index()["1"]["spec_drift"] is True


def test_update_context_file_no_drift_pre_lock(ctx):
    ctx.upsert_story_index(1, phase_status="gherkin_locked")
    resp = update_context_file(
        "design-bundle.md",
        UpdateContextFileRequest(content="# edited"),
        RequestContext(pm_token="tok", project_id=ctx._get_project_id()),
    )
    assert resp.get("drift") is None


def test_acknowledge_drift_clears_flag(ctx):
    from backend.app.api.workspace import acknowledge_spec_drift, get_amendments
    ctx.upsert_story_index(1, phase_status="implementation")
    ctx.amend_locked_spec("technical-spec.md", note="x")
    rc = RequestContext(pm_token="tok", project_id=ctx._get_project_id())
    assert acknowledge_spec_drift(1, rc) == {"ok": True}
    assert ctx.get_story_index()["1"]["spec_drift"] is False
    # amendment log still readable
    assert "technical-spec.md" in get_amendments(rc)["amendments_md"]


def test_stats_lists_drifted_story_ids(ctx):
    ctx.upsert_story_index(1, phase_status="implementation")
    ctx.upsert_story_index(2, phase_status="qa")
    ctx.upsert_story_index(3, phase_status="gherkin_locked")  # pre-lock, not flagged
    ctx.amend_locked_spec("technical-spec.md")  # flags 1 and 2 (design_locked+)
    stats = story_index_stats(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert stats["spec_drift"] == 2
    assert stats["drifted_story_ids"] == [1, 2]


def test_stats_lists_regressed_story_ids(ctx):
    ctx.upsert_story_index(1, phase_status="implementation")
    ctx.upsert_story_index(2, phase_status="qa")
    ctx.upsert_story_index(3, phase_status="deployed")
    ctx.set_conformance_regressed(2, "score 90→60")
    ctx.set_conformance_regressed(3, "row worsened")
    stats = story_index_stats(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert stats["conformance_regressed"] == 2
    assert stats["regressed_story_ids"] == [2, 3]
    # acknowledging clears it
    ctx.clear_conformance_regressed(2)
    stats2 = story_index_stats(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert stats2["regressed_story_ids"] == [3]


def test_log_decision_appends_and_lists_in_context_files(ctx):
    rc = RequestContext(pm_token="tok", project_id=ctx._get_project_id())
    assert log_decision(
        LogDecisionRequest(scope="Phase 3 dev pack · task #5", summary="Discarded regen", reason="Kept previous"),
        rc,
    ) == {"ok": True}
    # decisions.md is exposed in the Active Context file list, with the new record
    files = get_context_files(rc)
    decisions = next(f for f in files["files"] if f["filename"] == "decisions.md")
    assert decisions["label"] == "Decision Log"
    assert "Discarded regen" in decisions["content"]
    assert "Kept previous" in decisions["content"]


def test_stats_lists_conflict_flags_and_acknowledge(ctx):
    from backend.app.api.workspace import acknowledge_design_conflict
    ctx.upsert_story_index(1, phase_status="design_locked")
    ctx.upsert_story_index(2, phase_status="implementation")
    ctx.set_design_conflict(1, "shares models/user.py with #2")
    ctx.set_design_conflict(2, "shares models/user.py with #1")
    rc = RequestContext(pm_token="tok", project_id=ctx._get_project_id())
    stats = story_index_stats(rc)
    assert stats["design_conflict"] == 2
    assert stats["conflicted_story_ids"] == [1, 2]
    info = {c["story_id"]: c["reason"] for c in stats["conflict_flags"]}
    assert "models/user.py" in info[1]
    assert acknowledge_design_conflict(1, rc) == {"ok": True}
    assert story_index_stats(rc)["conflicted_story_ids"] == [2]


def test_stats_lists_trace_flags(ctx):
    from backend.app.api.workspace import acknowledge_backward_trace
    ctx.upsert_story_index(1, phase_status="deployed")
    ctx.upsert_story_index(2, phase_status="qa_passed")
    ctx.set_trace_flag(1, "gherkin_locked", "scenario untested")
    ctx.set_trace_flag(2, "design_locked", "endpoint missing")
    rc = RequestContext(pm_token="tok", project_id=ctx._get_project_id())
    stats = story_index_stats(rc)
    assert stats["trace_flagged"] == 2
    assert stats["trace_story_ids"] == [1, 2]
    info = {t["story_id"]: t for t in stats["trace_flags"]}
    assert info[1]["phase_label"] == "Phase 1" and info[2]["phase_label"] == "Phase 2"
    assert info[1]["reason"] == "scenario untested"
    # acknowledge clears
    assert acknowledge_backward_trace(1, rc) == {"ok": True}
    assert story_index_stats(rc)["trace_story_ids"] == [2]


# ── rebuild_story_index ───────────────────────────────────────────────────────


def test_rebuild_story_index_uses_request_project(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr(
        "src.context_manager.set_active_project", lambda pid: calls.append(("project", pid))
    )
    monkeypatch.setattr(
        "src.context_manager.rebuild_story_index", lambda: calls.append(("rebuild",))
    )

    response = rebuild_story_index(RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("rebuild",)]


def test_rebuild_story_index_maps_failure_to_500(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)

    def boom() -> None:
        raise RuntimeError("disk gone")

    monkeypatch.setattr("src.context_manager.rebuild_story_index", boom)

    with pytest.raises(HTTPException) as exc_info:
        rebuild_story_index(RequestContext(pm_token="tok", project_id=42))

    assert exc_info.value.status_code == 500
