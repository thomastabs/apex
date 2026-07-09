"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import AuthContext
from backend.app.api.workspace import (
    delete_ai_key,
    get_ai_config,
    get_config,
    get_context_files,
    get_figma_token,
    get_github_pat,
    get_story_phase_status,
    github_sync_status,
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
    # github_repo is per-project now (figma_file_key stays per-instance) — stub
    # the project-scoped lookup, passing project_id through the route call.
    monkeypatch.setattr("src.context_manager.get_project_github_repo", lambda pid: "owner/repo")
    monkeypatch.setattr("src.context_manager.get_instance_figma_file_key", lambda: "FIGKEY")

    response = get_config(_AUTH, project_id=42)

    assert response == {
        "project_id": 42,
        "taiga_web_url": "https://taiga.example",
        "pm_tool": "taiga",
        "pm_web_url": "https://taiga.example",
        "github_repo": "owner/repo",
        "figma_file_key": "FIGKEY",
        "github_pat_configured": False,
        "figma_token_configured": False,
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
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
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


def test_save_config_persists_project_and_per_project_github(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr("src.context_manager.save_config", lambda pid: calls.append(("project", pid)))
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    # github_repo is per-project now (not the legacy per-instance/global storage).
    monkeypatch.setattr(
        "src.context_manager.save_project_github_repo", lambda repo: calls.append(("github", repo))
    )

    response = save_config(
        SaveConfigRequest(project_id=42, github_repo="owner/repo"), _AUTH
    )

    assert response == {"ok": True}
    assert calls == [("project", 42), ("github", "owner/repo")]


def test_save_config_requires_project_id_for_github_fields(monkeypatch):
    with pytest.raises(HTTPException) as exc_info:
        save_config(SaveConfigRequest(github_repo="owner/repo"), _AUTH)
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        save_config(SaveConfigRequest(github_pat="ghp_abc123"), _AUTH)
    assert exc_info.value.status_code == 400


def test_save_config_persists_github_pat_and_figma_token(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr(
        "src.context_manager.save_project_github_pat", lambda pat: calls.append(("github_pat", pat))
    )
    monkeypatch.setattr(
        "src.context_manager.save_instance_figma_token", lambda token: calls.append(("figma_token", token))
    )

    response = save_config(
        SaveConfigRequest(project_id=42, github_pat="ghp_abc123", figma_token="figd_xyz789"), _AUTH
    )

    assert response == {"ok": True}
    assert ("github_pat", "ghp_abc123") in calls
    assert ("figma_token", "figd_xyz789") in calls


def test_save_config_omits_credentials_when_not_provided(monkeypatch):
    called = []
    monkeypatch.setattr("src.context_manager.save_instance_github_pat", lambda pat: called.append("github_pat"))
    monkeypatch.setattr("src.context_manager.save_instance_figma_token", lambda token: called.append("figma_token"))

    save_config(SaveConfigRequest(project_id=1), _AUTH)

    assert called == []


def test_save_config_github_pat_encryption_unset_returns_503_not_500(monkeypatch):
    # Real prod incident: AI_KEY_ENCRYPTION_SECRET unconfigured made this a raw
    # 500 with no message — encrypt_value()'s RuntimeError must map to 503.
    def _boom(pat):
        raise RuntimeError("AI_KEY_ENCRYPTION_SECRET is not configured on this deployment.")

    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.save_project_github_pat", _boom)

    with pytest.raises(HTTPException) as exc_info:
        save_config(SaveConfigRequest(project_id=42, github_pat="ghp_abc123"), _AUTH)
    assert exc_info.value.status_code == 503


def test_save_config_figma_token_encryption_unset_returns_503_not_500(monkeypatch):
    def _boom(token):
        raise RuntimeError("AI_KEY_ENCRYPTION_SECRET is not configured on this deployment.")

    monkeypatch.setattr("src.context_manager.save_instance_figma_token", _boom)

    with pytest.raises(HTTPException) as exc_info:
        save_config(SaveConfigRequest(figma_token="figd_xyz789"), _AUTH)
    assert exc_info.value.status_code == 503


def test_get_config_reports_credential_configured_flags(monkeypatch):
    monkeypatch.setattr("src.context_manager.load_config", lambda: {})
    monkeypatch.setattr("src.taiga_adapter.get_web_base_url", lambda: "https://taiga.example")
    monkeypatch.setattr("src.context_manager.get_project_github_repo", lambda pid: "")
    monkeypatch.setattr("src.context_manager.get_instance_figma_file_key", lambda: "")
    monkeypatch.setattr("src.context_manager.has_project_github_pat", lambda pid: True)
    monkeypatch.setattr("src.context_manager.has_instance_figma_token", lambda: False)

    response = get_config(_AUTH, project_id=42)

    assert response["github_pat_configured"] is True
    assert response["figma_token_configured"] is False


def test_get_github_pat_returns_decrypted_value(monkeypatch):
    monkeypatch.setattr("src.context_manager.get_project_github_pat", lambda pid: "ghp_decrypted")
    assert get_github_pat(_AUTH, project_id=42) == {"pat": "ghp_decrypted"}


def test_get_github_pat_empty_when_none_saved(monkeypatch):
    monkeypatch.setattr("src.context_manager.get_project_github_pat", lambda pid: "")
    assert get_github_pat(_AUTH, project_id=42) == {"pat": ""}


def test_get_github_pat_empty_when_no_project_selected():
    assert get_github_pat(_AUTH) == {"pat": ""}


def test_get_figma_token_returns_decrypted_value(monkeypatch):
    monkeypatch.setattr("src.context_manager.get_instance_figma_token", lambda: "figd_decrypted")
    assert get_figma_token(_AUTH) == {"token": "figd_decrypted"}


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


# ── github sync-status: cheap poll target for auto-resync ─────────────────────

def test_github_sync_status_defaults_to_both_none(ctx):
    resp = github_sync_status(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert resp == {"last_push_at": None, "context_synced_at": None}


def test_github_sync_status_reports_recorded_push(ctx):
    ctx.record_github_push()
    resp = github_sync_status(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert resp["last_push_at"] is not None
    assert resp["context_synced_at"] is None


def test_github_sync_status_reports_synced_file_mtime(ctx):
    ctx.init_context()
    ctx.write_context_file("github-context.md", "# repo tree")
    resp = github_sync_status(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert resp["context_synced_at"] is not None


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


# ── github/sync-context: server-side clone + repomix pack ─────────────────────

class TestSyncGithubContextRoute:
    def _ctx(self):
        return RequestContext(pm_token="tok", project_id=42)

    def _stub_budgets(self, monkeypatch, ws):
        # Isolates these route tests from ai_engine.get_model()/AVAILABLE_MODELS
        # and ContextService.read_context_file — covered separately by
        # TestGithubPackTokenBudgets below.
        monkeypatch.setattr(ws, "_github_pack_token_budgets", lambda context: (30_000, 80_000))

    def test_writes_packed_context_and_flags_drift(self, monkeypatch):
        from backend.app.api import workspace as ws
        from backend.app.services import github_fetch

        monkeypatch.setattr(github_fetch, "fetch_default_branch", lambda pat, owner, repo: "main")
        monkeypatch.setattr(github_fetch, "clone_and_pack", lambda pat, owner, repo, ref, full_budget, compress_budget: "# GitHub Repository Context\n\nreal file contents")
        monkeypatch.setattr(ws.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(ws.ContextService, "github_pat", lambda self: "ghp_test")
        monkeypatch.setattr(ws.ContextService, "github_repo", lambda self: "acme/widgets")
        self._stub_budgets(monkeypatch, ws)
        written: dict[str, str] = {}
        amend_calls = []
        monkeypatch.setattr(ws.ContextService, "write_context_file", lambda self, name, content: written.update({name: content}))
        monkeypatch.setattr(ws.ContextService, "amend_locked_spec", lambda self, name, note="": amend_calls.append((name, note)))
        monkeypatch.setattr(ws, "get_context_files", lambda ctx: {"files": []})

        resp = ws.sync_github_context(ctx=self._ctx())

        assert written["github-context.md"] == "# GitHub Repository Context\n\nreal file contents"
        assert amend_calls == [("github-context.md", "Server-side GitHub sync")]
        assert resp == {"files": []}

    def test_requires_pat(self, monkeypatch):
        from backend.app.api import workspace as ws

        monkeypatch.setattr(ws.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(ws.ContextService, "github_pat", lambda self: "")
        monkeypatch.setattr(ws.ContextService, "github_repo", lambda self: "acme/widgets")

        with pytest.raises(HTTPException) as exc:
            ws.sync_github_context(ctx=self._ctx())
        assert exc.value.status_code == 400

    def test_requires_repo(self, monkeypatch):
        from backend.app.api import workspace as ws

        monkeypatch.setattr(ws.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(ws.ContextService, "github_pat", lambda self: "ghp_test")
        monkeypatch.setattr(ws.ContextService, "github_repo", lambda self: "")

        with pytest.raises(HTTPException) as exc:
            ws.sync_github_context(ctx=self._ctx())
        assert exc.value.status_code == 400

    def test_maps_fetch_error_status_code_through(self, monkeypatch):
        from backend.app.api import workspace as ws
        from backend.app.services import github_fetch

        def boom(pat, owner, repo):
            raise github_fetch.GithubFetchError("GitHub rejected the token.", status_code=401)

        monkeypatch.setattr(github_fetch, "fetch_default_branch", boom)
        monkeypatch.setattr(ws.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(ws.ContextService, "github_pat", lambda self: "bad_pat")
        monkeypatch.setattr(ws.ContextService, "github_repo", lambda self: "acme/widgets")
        self._stub_budgets(monkeypatch, ws)

        with pytest.raises(HTTPException) as exc:
            ws.sync_github_context(ctx=self._ctx())
        assert exc.value.status_code == 401

    def test_maps_unrecognized_status_code_to_502(self, monkeypatch):
        from backend.app.api import workspace as ws
        from backend.app.services import github_fetch

        def boom(pat, owner, repo):
            raise github_fetch.GithubFetchError("Timed out cloning the repository.")

        monkeypatch.setattr(github_fetch, "fetch_default_branch", boom)
        monkeypatch.setattr(ws.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(ws.ContextService, "github_pat", lambda self: "pat")
        monkeypatch.setattr(ws.ContextService, "github_repo", lambda self: "acme/widgets")
        self._stub_budgets(monkeypatch, ws)

        with pytest.raises(HTTPException) as exc:
            ws.sync_github_context(ctx=self._ctx())
        assert exc.value.status_code == 502


class TestGithubPackTokenBudgets:
    """_github_pack_token_budgets: scales the repomix pack budget to the
    configured AI model's real context window minus what the other context
    files already use, so github-context.md stops unilaterally claiming the
    whole shared context budget (real prod incident: 139_972-char pack on a
    project whose other files already totalled ~63k chars)."""

    def test_scales_down_for_small_model_and_large_other_files(self, monkeypatch):
        from backend.app.api import workspace as ws
        from backend.app.services.context_service import ContextService

        import src.ai_engine as ai_engine
        monkeypatch.setattr(ai_engine, "get_model", lambda: "gpt-4o-mini")

        context = ContextService.__new__(ContextService)
        # 100k chars already used by the other 8 context files.
        monkeypatch.setattr(ContextService, "read_context_file", lambda self, name: "x" * 100_000)

        full, compress = ws._github_pack_token_budgets(context)
        # gpt-4o-mini: 128_000-token window * 1.0 char/token * 0.75 warn
        # fraction = 96_000 char target, minus 100_000 already used -> 0
        # remaining -> both budgets clamp to the floor, not zero.
        assert full == github_fetch_min_token_budget()
        assert compress == github_fetch_min_token_budget()

    def test_uses_full_ceiling_when_other_files_are_small(self, monkeypatch):
        from backend.app.api import workspace as ws
        import src.ai_engine as ai_engine
        from backend.app.services.context_service import ContextService

        monkeypatch.setattr(ai_engine, "get_model", lambda: "claude-sonnet-5")
        context = ContextService.__new__(ContextService)
        monkeypatch.setattr(ContextService, "read_context_file", lambda self, name: "")

        full, compress = ws._github_pack_token_budgets(context)
        from backend.app.services import github_fetch
        assert full == github_fetch._DEFAULT_TOKEN_BUDGET
        assert compress == github_fetch._COMPRESS_TOKEN_BUDGET


def github_fetch_min_token_budget() -> int:
    from backend.app.services import github_fetch
    return github_fetch._MIN_TOKEN_BUDGET
