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
