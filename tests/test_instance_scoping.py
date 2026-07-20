"""Instance-scoped context storage (multi-user × multi-instance).

Context files live under contextspec/<instance_id>/<project_id>/, so the same
project_id on different Taiga instances (Cloud vs private) never collides and a
request can only ever reach the namespace of an instance its token validates on.
"""

import pytest

from src import context_manager as cm


class TestInstanceKey:
    def test_cloud_api_base(self):
        assert cm.instance_key("https://api.taiga.io/api/v1") == "api_taiga_io"

    def test_private_host(self):
        assert cm.instance_key("https://taiga.acme.com/api/v1") == "taiga_acme_com"

    def test_jira_host(self):
        assert cm.instance_key("https://acme.atlassian.net") == "acme_atlassian_net"

    def test_case_and_port_normalised(self):
        # hostname is lowercased; the port is not part of the namespace
        assert cm.instance_key("https://Taiga.ACME.com:9000") == "taiga_acme_com"

    def test_blank_is_default(self):
        assert cm.instance_key("") == "default"
        assert cm.instance_key("not a url") == "default"


class TestStorageIsolation:
    def test_same_project_different_instances_do_not_collide(self, ctx):
        # Instance A, project 5
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(5)
        pa = ctx._path("probe.md")
        pa.parent.mkdir(parents=True, exist_ok=True)
        pa.write_text("CLOUD")

        # Instance B, SAME project id 5 → different namespace, file not visible
        ctx.set_active_instance("taiga_acme_com")
        ctx.set_active_project(5)
        pb = ctx._path("probe.md")
        assert str(pa) != str(pb)
        assert not pb.exists()
        pb.parent.mkdir(parents=True, exist_ok=True)
        pb.write_text("PRIVATE")

        # Back to A → still the cloud file, untouched
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(5)
        assert ctx._path("probe.md").read_text() == "CLOUD"

    def test_story_index_cache_keyed_by_instance(self, ctx):
        # Writing the index under one instance must not surface under another.
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(7)
        ctx.upsert_story_index(1, title="cloud story", phase_status="gherkin_locked")
        assert "1" in ctx.get_story_index()

        ctx.set_active_instance("taiga_acme_com")
        ctx.set_active_project(7)
        assert ctx.get_story_index() == {}  # different namespace, empty index


class TestMigration:
    def _seed_legacy(self, base, pid: int, content: str):
        legacy = base / str(pid)
        legacy.mkdir(parents=True, exist_ok=True)
        (legacy / "project-concept.md").write_text(content)
        (legacy / "story-index.json").write_text("{}")
        return legacy

    def test_migrates_legacy_dirs_into_namespace(self, ctx):
        base = ctx._BASE_CONTEXTSPEC
        self._seed_legacy(base, 5, "LEGACY-5")
        self._seed_legacy(base, 12, "LEGACY-12")

        moved = ctx.migrate_to_instance_scoped("api_taiga_io")
        assert moved == 2

        assert (base / "api_taiga_io" / "5" / "project-concept.md").read_text() == "LEGACY-5"
        assert (base / "api_taiga_io" / "12" / "project-concept.md").read_text() == "LEGACY-12"
        # legacy root dirs removed
        assert not (base / "5").exists()
        assert not (base / "12").exists()

    def test_migration_is_idempotent(self, ctx):
        base = ctx._BASE_CONTEXTSPEC
        self._seed_legacy(base, 5, "LEGACY")
        assert ctx.migrate_to_instance_scoped("api_taiga_io") == 1
        # re-run: nothing left at root to move
        assert ctx.migrate_to_instance_scoped("api_taiga_io") == 0

    def test_migration_leaves_existing_namespace_dirs_untouched(self, ctx):
        base = ctx._BASE_CONTEXTSPEC
        # Pre-existing migrated data in another namespace
        (base / "taiga_acme_com" / "9").mkdir(parents=True, exist_ok=True)
        (base / "taiga_acme_com" / "9" / "x.md").write_text("KEEP")
        self._seed_legacy(base, 5, "LEGACY")

        moved = ctx.migrate_to_instance_scoped("api_taiga_io")
        assert moved == 1  # only the numeric root dir, not the namespace dir
        assert (base / "taiga_acme_com" / "9" / "x.md").read_text() == "KEEP"


class TestRequestContextDerivesInstance:
    """get_request_context must stamp instance_id from the validated anchor so
    storage isolation is wired end-to-end (security gap: rogue-anchor sandbox)."""

    @pytest.mark.real_auth
    def test_instance_id_from_header_anchor(self, monkeypatch):
        from unittest.mock import MagicMock, patch
        from backend.app.api import deps

        # Bypass the network credential checks; we only assert the derived id.
        monkeypatch.setattr(deps, "_verify_pm_token", lambda *a, **k: None)
        monkeypatch.setattr(deps, "_verify_project_access", lambda *a, **k: None)
        monkeypatch.delenv("TAIGA_API_URL", raising=False)

        # Make SSRF DNS deterministic (public-looking host) and config = taiga.
        import socket as _socket
        from backend.app.api import ssrf
        dns = MagicMock(getaddrinfo=MagicMock(return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]),
                        AF_INET=_socket.AF_INET)
        with patch.object(ssrf, "socket", dns), \
             patch("src.context_manager.load_config", return_value={"pm_tool": "taiga"}):
            rc = deps.get_request_context(
                "Bearer tok", "https://private.example.org", 5, None,
            )
        assert rc.instance_id == "private_example_org"
        assert rc.project_id == 5


class TestJiraAnchorOverride:
    """Jira identity anchoring must prefer a per-request override over the
    shared workspace config, mirroring Taiga's X-Taiga-Url protection — before
    this fix any PM-authenticated user could flip the global `jira_base_url`
    and misroute every other Jira user's identity/project checks (audit H4)."""

    def test_override_wins_over_stale_config(self, monkeypatch):
        from backend.app.api import deps

        monkeypatch.setattr(
            "src.context_manager.load_config",
            lambda: {"pm_tool": "jira", "jira_base_url": "https://stale.atlassian.net"},
        )
        pm_tool, base = deps._anchor_base(jira_base_url_override="https://current.atlassian.net")
        assert pm_tool == "jira"
        assert base == "https://current.atlassian.net"

    def test_falls_back_to_config_when_no_override(self, monkeypatch):
        from backend.app.api import deps

        monkeypatch.setattr(
            "src.context_manager.load_config",
            lambda: {"pm_tool": "jira", "jira_base_url": "https://configured.atlassian.net"},
        )
        pm_tool, base = deps._anchor_base()
        assert pm_tool == "jira"
        assert base == "https://configured.atlassian.net"

    @pytest.mark.real_auth
    def test_resolve_anchor_base_validates_jira_override(self, monkeypatch):
        """The override must pass the same SSRF/domain guard as the config
        path — an override is just as user-influenced as the stored value."""
        from fastapi import HTTPException
        from backend.app.api import deps

        monkeypatch.setattr("src.context_manager.load_config", lambda: {"pm_tool": "jira"})
        with pytest.raises(HTTPException) as exc:
            deps._resolve_anchor_base(jira_base_url_override="https://evil.example.com")
        assert exc.value.status_code == 400

    @pytest.mark.real_auth
    def test_resolve_anchor_base_validates_configured_jira_base(self, monkeypatch):
        """Previously the config-sourced Jira base skipped validation entirely
        at dial time (only checked at config-write time) — now it is always
        re-validated here too, closing that gap."""
        from fastapi import HTTPException
        from backend.app.api import deps

        monkeypatch.setattr(
            "src.context_manager.load_config",
            lambda: {"pm_tool": "jira", "jira_base_url": "http://not-https.atlassian.net"},
        )
        with pytest.raises(HTTPException) as exc:
            deps._resolve_anchor_base()
        assert exc.value.status_code == 400

    @pytest.mark.real_auth
    def test_instance_id_from_jira_header_override(self, monkeypatch):
        from src import context_manager
        from backend.app.api import deps

        monkeypatch.setattr(deps, "_verify_pm_token", lambda *a, **k: None)
        monkeypatch.setattr(deps, "_verify_project_access", lambda *a, **k: None)
        monkeypatch.setattr(
            "src.context_manager.load_config",
            lambda: {"pm_tool": "jira", "jira_base_url": "https://stale.atlassian.net"},
        )
        rc = deps.get_request_context(
            "Bearer tok", "", 5, None, "https://current.atlassian.net",
        )
        assert rc.instance_id == context_manager.instance_key("https://current.atlassian.net")
        assert rc.instance_id != context_manager.instance_key("https://stale.atlassian.net")
        assert rc.project_id == 5


class TestPerInstanceGithub:
    """github_repo is scoped to the PM instance so Cloud and private users don't
    share one repo."""

    def test_github_repo_isolated_per_instance(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.save_instance_github_repo("cloud/repo")

        ctx.set_active_instance("taiga_acme_com")
        assert ctx.get_instance_github_repo() != "cloud/repo"
        ctx.save_instance_github_repo("private/repo")

        ctx.set_active_instance("api_taiga_io")
        assert ctx.get_instance_github_repo() == "cloud/repo"

    def test_github_repo_falls_back_to_legacy_global(self, ctx, monkeypatch):
        # No per-instance file yet → use the legacy global config value (migration).
        monkeypatch.setattr("src.context_manager.load_config", lambda: {"github_repo": "legacy/repo"})
        ctx.set_active_instance("api_taiga_io")
        assert ctx.get_instance_github_repo() == "legacy/repo"

    def test_figma_file_key_isolated_per_instance(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.save_instance_figma_file_key("CLOUDKEY")

        ctx.set_active_instance("taiga_acme_com")
        assert ctx.get_instance_figma_file_key() == ""
        ctx.save_instance_figma_file_key("PRIVATEKEY")

        ctx.set_active_instance("api_taiga_io")
        assert ctx.get_instance_figma_file_key() == "CLOUDKEY"

    def test_figma_and_github_coexist_in_instance_config(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.save_instance_github_repo("owner/repo")
        ctx.save_instance_figma_file_key("FIGKEY")
        # Writing one key must not clobber the other in .instance-config.json.
        assert ctx.get_instance_github_repo() == "owner/repo"
        assert ctx.get_instance_figma_file_key() == "FIGKEY"


class TestPerProjectGithub:
    """github_repo/github_pat moved from per-instance to per-project — connecting
    GitHub on one project must not silently connect it on every other project
    under the same PM instance. The webhook secret stays per-instance (out of
    scope — see context_manager.py's per-project GitHub section docstring)."""

    def test_github_repo_isolated_per_project(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_repo("repo-one/repo")

        ctx.set_active_project(2)
        assert ctx.get_project_github_repo() != "repo-one/repo"
        ctx.save_project_github_repo("repo-two/repo")

        ctx.set_active_project(1)
        assert ctx.get_project_github_repo() == "repo-one/repo"

    def test_github_pat_isolated_per_project(self, ctx, monkeypatch):
        monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "test-secret")
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pat("pat-one")

        ctx.set_active_project(2)
        assert ctx.get_project_github_pat() == ""
        assert ctx.has_project_github_pat() is False

        ctx.set_active_project(1)
        assert ctx.get_project_github_pat() == "pat-one"
        assert ctx.has_project_github_pat() is True

    def test_migration_only_inherits_into_the_last_active_project(self, ctx, monkeypatch):
        # Simulate a pre-existing instance-wide connection (the old behavior)
        # and a shared config.json recording project 1 as "last active" —
        # exactly the state that existed before this scoping change shipped.
        monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "test-secret")
        ctx.set_active_instance("api_taiga_io")
        ctx.save_instance_github_repo("legacy/repo")
        ctx.save_instance_github_pat("legacy-pat")
        monkeypatch.setattr("src.context_manager.load_config", lambda: {"project_id": 1})

        ctx.set_active_project(1)
        assert ctx.get_project_github_repo() == "legacy/repo"
        assert ctx.get_project_github_pat() == "legacy-pat"

        # A different project has no way to know the instance-wide connection
        # "belonged" to it — starts disconnected, no guess made.
        ctx.set_active_project(2)
        assert ctx.get_project_github_repo() == ""
        assert ctx.get_project_github_pat() == ""

    def test_migration_runs_at_most_once_per_project(self, ctx, monkeypatch):
        monkeypatch.setattr("src.context_manager.load_config", lambda: {"project_id": 1})
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_instance_github_repo("legacy/repo")

        assert ctx.get_project_github_repo() == "legacy/repo"  # first read: migrates

        # Instance-level value changes AFTER migration already ran for this
        # project — the per-project file is now the source of truth, must not
        # re-migrate and pick up the new instance-level value.
        ctx.save_instance_github_repo("changed/repo")
        assert ctx.get_project_github_repo() == "legacy/repo"

    def test_no_migration_when_last_active_project_unset(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.save_instance_github_repo("legacy/repo")
        # load_config() has no "project_id" recorded at all → no target project
        # to migrate into; every project starts clean.
        ctx.set_active_project(1)
        assert ctx.get_project_github_repo() == ""


class TestProjectGithubPackConfig:
    """pack_detail_mode/pack_max_tokens/pack_extra_ignore (Settings → GitHub →
    Pack settings) — stored in the same per-project file as github_repo, so
    isolated per project the same way."""

    def test_defaults_when_unset(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        assert ctx.get_project_github_pack_config() == {
            "pack_detail_mode": "auto", "pack_max_tokens": None, "pack_extra_ignore": "",
        }

    def test_save_and_read_round_trip(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pack_config(
            pack_detail_mode="compress", pack_max_tokens=50_000, pack_extra_ignore="assets/**,*.svg",
        )
        assert ctx.get_project_github_pack_config() == {
            "pack_detail_mode": "compress", "pack_max_tokens": 50_000, "pack_extra_ignore": "assets/**,*.svg",
        }

    def test_zero_or_negative_max_tokens_clears_override(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pack_config(pack_max_tokens=50_000)
        assert ctx.get_project_github_pack_config()["pack_max_tokens"] == 50_000
        ctx.save_project_github_pack_config(pack_max_tokens=0)
        assert ctx.get_project_github_pack_config()["pack_max_tokens"] is None

    def test_invalid_mode_falls_back_to_auto(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pack_config(pack_detail_mode="bogus")
        assert ctx.get_project_github_pack_config()["pack_detail_mode"] == "auto"

    def test_unset_fields_left_untouched(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pack_config(pack_detail_mode="full")
        ctx.save_project_github_pack_config(pack_extra_ignore="*.svg")
        cfg = ctx.get_project_github_pack_config()
        assert cfg["pack_detail_mode"] == "full"
        assert cfg["pack_extra_ignore"] == "*.svg"

    def test_isolated_per_project(self, ctx):
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_pack_config(pack_detail_mode="compress")

        ctx.set_active_project(2)
        assert ctx.get_project_github_pack_config()["pack_detail_mode"] == "auto"

        ctx.set_active_project(1)
        assert ctx.get_project_github_pack_config()["pack_detail_mode"] == "compress"

    def test_does_not_disturb_saved_repo_and_pat(self, ctx, monkeypatch):
        monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "test-secret")
        ctx.set_active_instance("api_taiga_io")
        ctx.set_active_project(1)
        ctx.save_project_github_repo("acme/widgets")
        ctx.save_project_github_pat("ghp_test")
        ctx.save_project_github_pack_config(pack_detail_mode="full", pack_max_tokens=20_000)
        assert ctx.get_project_github_repo() == "acme/widgets"
        assert ctx.get_project_github_pat() == "ghp_test"


class TestMultiInstanceIntegration:
    """Full plumbing: deps.get_request_context → ContextService.set_active →
    context_manager storage. Two instances with the SAME project_id must stay
    isolated, and a token must only reach the namespace of the instance it
    validated against (regressed 3× during the auth/multi-instance work)."""

    @staticmethod
    def _public_dns():
        from unittest.mock import MagicMock
        import socket as _socket
        return MagicMock(
            getaddrinfo=MagicMock(return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]),
            AF_INET=_socket.AF_INET,
        )

    @pytest.mark.real_auth
    def test_two_instances_same_project_id_isolated(self, monkeypatch, ctx):
        from unittest.mock import patch
        from backend.app.api import deps, ssrf
        from backend.app.services.context_service import ContextService

        # Token is accepted + member everywhere (mock only the network hop), so
        # the only thing separating the two requests is the validated anchor host.
        from collections import OrderedDict
        monkeypatch.setattr(deps, "_pm_get", lambda url, scheme, token: True)
        monkeypatch.setattr(deps, "_token_cache", OrderedDict())
        monkeypatch.setattr(deps, "_project_cache", OrderedDict())
        monkeypatch.delenv("TAIGA_API_URL", raising=False)

        with patch.object(ssrf, "socket", self._public_dns()):
            cloud = deps.get_request_context("Bearer tok", "https://api.taiga.io", 5, None)
            priv = deps.get_request_context("Bearer tok", "https://taiga.acme.com", 5, None)

        assert cloud.instance_id == "api_taiga_io"
        assert priv.instance_id == "taiga_acme_com"
        assert cloud.project_id == priv.project_id == 5

        cs = ContextService()
        cs.set_active(cloud)
        cs.write_context_file("project-concept.md", "CLOUD-5")

        # Same project_id, different instance → must NOT see the cloud file.
        cs.set_active(priv)
        assert cs.read_context_file("project-concept.md") != "CLOUD-5"
        cs.write_context_file("project-concept.md", "PRIVATE-5")

        # Cloud namespace untouched.
        cs.set_active(cloud)
        assert cs.read_context_file("project-concept.md") == "CLOUD-5"

        # Both namespaces exist on disk, side by side.
        names = sorted(e.name for e in ctx._BASE_CONTEXTSPEC.iterdir_dirs())
        assert names == ["api_taiga_io", "taiga_acme_com"]

    @pytest.mark.real_auth
    def test_token_not_member_of_project_gets_403(self, monkeypatch):
        from unittest.mock import patch
        from fastapi import HTTPException
        from backend.app.api import deps, ssrf

        # Token valid (identity 200) but NOT a member of the project (project 403).
        def fake_pm_get(url, scheme, token):
            return "/projects/" not in url  # identity ok, project check fails

        from collections import OrderedDict
        monkeypatch.setattr(deps, "_pm_get", fake_pm_get)
        monkeypatch.setattr(deps, "_token_cache", OrderedDict())
        monkeypatch.setattr(deps, "_project_cache", OrderedDict())
        monkeypatch.delenv("TAIGA_API_URL", raising=False)

        with patch.object(ssrf, "socket", self._public_dns()):
            with pytest.raises(HTTPException) as exc:
                deps.get_request_context("Bearer tok", "https://taiga.acme.com", 999, None)
        assert exc.value.status_code == 403
