"""Tests for the GitHub push webhook: signature auth, the cooldown gate now
shared by repack+scan, and _run_repack's own clone+pack+write orchestration.
"""

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from backend.app.api import github_webhook as gw
from backend.app.main import app


@pytest.fixture(autouse=True)
def _reset_cooldown():
    gw._last_run.clear()
    yield
    gw._last_run.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _secret_for(instance_id: str) -> str:
    from src import context_manager

    context_manager.set_active_instance(instance_id)
    return context_manager.get_or_create_instance_github_webhook_secret()


def _sign(secret: str, body: bytes) -> str:
    mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def _push_payload(repo_full_name="acme/widgets"):
    return {
        "repository": {"full_name": repo_full_name},
        "commits": [{"added": [], "modified": [], "removed": []}],
    }


class TestSignatureAuth:
    def test_invalid_signature_rejected(self, client):
        instance_id = "test_instance_sig"
        body = json.dumps(_push_payload()).encode()
        resp = client.post(
            f"/api/webhooks/github/{instance_id}/42",
            content=body,
            headers={"X-Hub-Signature-256": "sha256=deadbeef", "X-GitHub-Event": "push"},
        )
        assert resp.status_code == 401

    def test_non_push_event_ignored_cheaply(self, client):
        instance_id = "test_instance_ping"
        secret = _secret_for(instance_id)
        body = json.dumps(_push_payload()).encode()
        resp = client.post(
            f"/api/webhooks/github/{instance_id}/42",
            content=body,
            headers={"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "ping"},
        )
        assert resp.status_code == 200
        assert resp.json()["ignored"] == "ping"

    def test_workflow_run_event_records_phase5_completion(self, client, monkeypatch):
        instance_id = "test_instance_workflow_run"
        calls = []

        class FakePhase5Service:
            def __init__(self, context=None):
                self.context = context

            def record_github_deployment_run(self, ctx, workflow_run):
                calls.append((ctx.instance_id, ctx.project_id, workflow_run["id"]))
                return {"matched": True, "story_id": 10, "deployment": {"status": "completed", "conclusion": "success"}}

        monkeypatch.setattr(gw, "Phase5Service", FakePhase5Service)
        monkeypatch.setattr(gw.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(gw.ContextService, "github_repo", lambda self: "acme/widgets")

        payload = {
            "repository": {"full_name": "acme/widgets"},
            "workflow_run": {"id": 123, "status": "completed", "conclusion": "success"},
        }
        body = json.dumps(payload).encode()
        secret = _secret_for(instance_id)
        resp = client.post(
            f"/api/webhooks/github/{instance_id}/42",
            content=body,
            headers={"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "workflow_run"},
        )
        assert resp.status_code == 200
        assert resp.json()["matched"] is True
        assert calls == [(instance_id, 42, 123)]


class TestRepoMismatchIsProjectScoped:
    """github_repo is per-project now — the mismatch check must read the repo
    configured for THIS push's project_id, not some other project active from
    a prior request on this worker. Regression test for the set_project-before-
    github_repo() ordering fix in github_push_webhook."""

    def test_mismatch_check_uses_this_projects_repo_not_a_different_ones(self, client, monkeypatch):
        from backend.app.services.context_service import ContextService

        instance_id = "test_instance_repo_scope"
        monkeypatch.setattr(gw, "_run_repack", lambda iid, pid: None)
        monkeypatch.setattr(gw, "_run_scan", lambda iid, pid, sids: None)
        monkeypatch.setattr(gw, "_matched_story_ids", lambda context, touched: [])

        def fake_github_repo(self):
            # Project 42 is configured for "acme/widgets"; any other project
            # (e.g. 99) is configured for something else entirely.
            pid = ContextService().active_project_id()
            return "acme/widgets" if pid == 42 else "someone-else/other-repo"

        monkeypatch.setattr(ContextService, "github_repo", fake_github_repo)

        secret = _secret_for(instance_id)
        body = json.dumps(_push_payload(repo_full_name="acme/widgets")).encode()
        headers = {"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "push"}

        # Push claims to be for "acme/widgets" against project 42's URL — repo
        # matches project 42's config, must NOT be flagged as a mismatch.
        resp = client.post(f"/api/webhooks/github/{instance_id}/42", content=body, headers=headers)
        assert "ignored" not in resp.json()

        # Same repo claim against project 99's URL — project 99 is configured
        # for a DIFFERENT repo, so this must be flagged as a mismatch. (Before
        # the ordering fix, github_repo() was read before set_project() ran,
        # so this would have wrongly reused whatever project was last active.)
        resp2 = client.post(f"/api/webhooks/github/{instance_id}/99", content=body, headers=headers)
        assert resp2.json().get("ignored", "").startswith("repo mismatch")


class TestRepackAndScanOrchestration:
    def test_repack_scheduled_on_every_push_even_with_no_matched_stories(self, client, monkeypatch):
        instance_id = "test_instance_repack_only"
        calls = {"repack": [], "scan": []}
        monkeypatch.setattr(gw, "_run_repack", lambda iid, pid: calls["repack"].append((iid, pid)))
        monkeypatch.setattr(gw, "_run_scan", lambda iid, pid, sids: calls["scan"].append((iid, pid, sids)))
        monkeypatch.setattr(gw, "_matched_story_ids", lambda context, touched: [])

        secret = _secret_for(instance_id)
        body = json.dumps(_push_payload()).encode()
        resp = client.post(
            f"/api/webhooks/github/{instance_id}/42",
            content=body,
            headers={"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "push"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["repacking"] is True
        assert data["matched_stories"] == []
        assert "scanning" not in data
        assert calls["repack"] == [(instance_id, 42)]
        assert calls["scan"] == []

    def test_repack_and_scan_both_scheduled_when_stories_matched(self, client, monkeypatch):
        instance_id = "test_instance_both"
        calls = {"repack": [], "scan": []}
        monkeypatch.setattr(gw, "_run_repack", lambda iid, pid: calls["repack"].append((iid, pid)))
        monkeypatch.setattr(gw, "_run_scan", lambda iid, pid, sids: calls["scan"].append((iid, pid, sids)))
        monkeypatch.setattr(gw, "_matched_story_ids", lambda context, touched: [7, 9])

        secret = _secret_for(instance_id)
        body = json.dumps(_push_payload()).encode()
        resp = client.post(
            f"/api/webhooks/github/{instance_id}/42",
            content=body,
            headers={"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "push"},
        )
        data = resp.json()
        assert data["repacking"] is True
        assert data["scanning"] is True
        assert data["matched_stories"] == [7, 9]
        assert calls["repack"] == [(instance_id, 42)]
        assert calls["scan"] == [(instance_id, 42, [7, 9])]

    def test_cooldown_blocks_both_repack_and_scan_with_one_shared_gate(self, client, monkeypatch):
        instance_id = "test_instance_cooldown"
        calls = {"repack": [], "scan": []}
        monkeypatch.setattr(gw, "_run_repack", lambda iid, pid: calls["repack"].append((iid, pid)))
        monkeypatch.setattr(gw, "_run_scan", lambda iid, pid, sids: calls["scan"].append((iid, pid, sids)))
        monkeypatch.setattr(gw, "_matched_story_ids", lambda context, touched: [1])

        secret = _secret_for(instance_id)
        body = json.dumps(_push_payload()).encode()
        headers = {"X-Hub-Signature-256": _sign(secret, body), "X-GitHub-Event": "push"}

        first = client.post(f"/api/webhooks/github/{instance_id}/42", content=body, headers=headers)
        assert first.json()["repacking"] is True

        second = client.post(f"/api/webhooks/github/{instance_id}/42", content=body, headers=headers)
        assert second.json().get("skipped") == "cooldown"

        # Only the first request's background tasks actually ran.
        assert calls["repack"] == [(instance_id, 42)]
        assert calls["scan"] == [(instance_id, 42, [1])]


class TestRunRepackInternals:
    def test_writes_context_and_amends_on_success(self, monkeypatch):
        monkeypatch.setattr(gw.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(gw.ContextService, "github_pat", lambda self: "ghp_test")
        monkeypatch.setattr(gw.ContextService, "github_repo", lambda self: "acme/widgets")
        written: dict[str, str] = {}
        amend_calls = []
        monkeypatch.setattr(gw.ContextService, "write_context_file", lambda self, name, content: written.update({name: content}))
        monkeypatch.setattr(gw.ContextService, "amend_locked_spec", lambda self, name, note="": amend_calls.append((name, note)))
        monkeypatch.setattr(gw.github_fetch, "fetch_default_branch", lambda pat, owner, repo: "main")
        monkeypatch.setattr(gw.github_fetch, "clone_and_pack", lambda pat, owner, repo, ref: "# packed content")

        gw._run_repack("inst", 42)

        assert written["github-context.md"] == "# packed content"
        assert amend_calls == [("github-context.md", "Server-side GitHub sync (auto, push webhook)")]

    def test_skips_silently_when_no_pat_configured(self, monkeypatch):
        monkeypatch.setattr(gw.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(gw.ContextService, "github_pat", lambda self: "")
        monkeypatch.setattr(gw.ContextService, "github_repo", lambda self: "acme/widgets")
        write_called = []
        monkeypatch.setattr(gw.ContextService, "write_context_file", lambda self, name, content: write_called.append(name))

        gw._run_repack("inst", 42)  # must not raise

        assert write_called == []

    def test_failure_is_caught_and_logged_not_raised(self, monkeypatch):
        monkeypatch.setattr(gw.ContextService, "set_active", lambda self, ctx: None)
        monkeypatch.setattr(gw.ContextService, "github_pat", lambda self: "ghp_test")
        monkeypatch.setattr(gw.ContextService, "github_repo", lambda self: "acme/widgets")

        def boom(pat, owner, repo):
            raise gw.github_fetch.GithubFetchError("clone failed")

        monkeypatch.setattr(gw.github_fetch, "fetch_default_branch", boom)

        gw._run_repack("inst", 42)  # must not raise, must not propagate
