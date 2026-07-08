"""Unit tests for github_fetch.py's clone+pack pipeline.

The `git clone` and `repomix` calls are mocked at the subprocess.run boundary
(same spirit as test_taiga_proxy.py's monkeypatch on the http client, applied
to subprocess here) — no real network, no real git/repomix binaries needed to
run this suite. A dedicated test asserts the PAT never appears in subprocess
argv (only in the env dict), which is the whole point of the GIT_CONFIG_*
auth design over a URL-embedded token.
"""

import subprocess
from pathlib import Path

import pytest

from backend.app.services import github_fetch as gf


def _fake_run_factory(clone_files=None, repomix_content="# packed\n", repomix_returncode=0, clone_returncode=0, clone_stderr=""):
    """Builds a fake subprocess.run that mimics `git clone` then `repomix`.

    Records every call's argv + env so tests can assert on them afterwards.
    """
    calls = []

    def _fake_run(args, env=None, timeout=None, cwd=None, capture_output=None, text=None):
        calls.append({"args": list(args), "env": dict(env or {}), "cwd": cwd})
        bin_name = Path(args[0]).name
        if bin_name == gf._GIT_BIN or args[0] == gf._GIT_BIN:
            dest = Path(args[-1])
            if clone_returncode == 0:
                dest.mkdir(parents=True, exist_ok=True)
                for rel, content in (clone_files or {"README.md": "hello"}).items():
                    p = dest / rel
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(content)
            return subprocess.CompletedProcess(args, clone_returncode, stdout="", stderr=clone_stderr)
        if bin_name == gf._REPOMIX_BIN or args[0] == gf._REPOMIX_BIN:
            out_idx = args.index("-o") + 1
            out_path = Path(args[out_idx])
            if repomix_returncode == 0:
                out_path.write_text(repomix_content)
            return subprocess.CompletedProcess(args, repomix_returncode, stdout="", stderr="")
        raise AssertionError(f"unexpected subprocess call: {args}")

    _fake_run.calls = calls
    return _fake_run


class TestCloneAndPack:
    def test_happy_path_returns_packed_markdown(self, monkeypatch):
        fake_run = _fake_run_factory(repomix_content="# GitHub Repository Context\n\nreal file contents here")
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        md = gf.clone_and_pack("ghp_test_pat_value", "acme", "widgets", "main")
        assert "real file contents here" in md
        assert len(fake_run.calls) == 2  # clone, then pack
        # Default pack is full function bodies — --compress is a fallback
        # only, not used when the pack fits the budget on the first try.
        assert "--compress" not in fake_run.calls[1]["args"]

    def test_clone_auth_failure_maps_to_401(self, monkeypatch):
        fake_run = _fake_run_factory(clone_returncode=128, clone_stderr="fatal: Authentication failed for 'https://github.com/...'")
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        with pytest.raises(gf.GithubFetchError) as exc_info:
            gf.clone_and_pack("bad_pat", "acme", "widgets", "main")
        assert exc_info.value.status_code == 401

    def test_clone_generic_failure_status_zero(self, monkeypatch):
        fake_run = _fake_run_factory(clone_returncode=128, clone_stderr="fatal: repository not found")
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        with pytest.raises(gf.GithubFetchError) as exc_info:
            gf.clone_and_pack("pat", "acme", "ghost-repo", "main")
        assert exc_info.value.status_code == 0

    def test_clone_timeout_raises_clean_error(self, monkeypatch):
        def _timeout(*a, **kw):
            raise subprocess.TimeoutExpired(cmd="git", timeout=1)

        monkeypatch.setattr(gf.subprocess, "run", _timeout)
        with pytest.raises(gf.GithubFetchError, match="Timed out cloning"):
            gf.clone_and_pack("pat", "acme", "widgets", "main")

    def test_oversized_working_tree_rejected(self, monkeypatch):
        fake_run = _fake_run_factory(clone_files={"big.bin": "x" * 1000})
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        monkeypatch.setattr(gf, "_MAX_CLONE_BYTES", 10)
        with pytest.raises(gf.GithubFetchError, match="over the"):
            gf.clone_and_pack("pat", "acme", "widgets", "main")
        # repomix must never have been invoked once the size cap rejected the clone
        assert len(fake_run.calls) == 1

    def test_repomix_falls_back_to_compress_when_full_pack_exceeds_budget(self, monkeypatch):
        # First (uncompressed) attempt fails with a budget error; the
        # compressed retry succeeds — must return the compressed content,
        # not raise, and the second call must carry --compress.
        calls = {"n": 0}

        def _run(args, **kw):
            bin_name = Path(args[0]).name
            if bin_name == gf._GIT_BIN or args[0] == gf._GIT_BIN:
                dest = Path(args[-1])
                dest.mkdir(parents=True, exist_ok=True)
                (dest / "README.md").write_text("hi")
                return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
            calls["n"] += 1
            out_idx = args.index("-o") + 1
            out_path = Path(args[out_idx])
            if calls["n"] == 1:
                assert "--compress" not in args
                return subprocess.CompletedProcess(args, 1, stdout="Error: token budget exceeded", stderr="")
            assert "--compress" in args
            # Regression: appending --compress must not corrupt --style's
            # "markdown" value pairing (a prior fixed-index insert did).
            style_idx = args.index("--style")
            assert args[style_idx + 1] == "markdown"
            out_path.write_text("# compressed fallback content")
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

        monkeypatch.setattr(gf.subprocess, "run", _run)
        md = gf.clone_and_pack("pat", "acme", "widgets", "main")
        assert md == "# compressed fallback content"
        assert calls["n"] == 2

    def test_repomix_token_budget_exceeded_even_compressed(self, monkeypatch):
        fake_run = _fake_run_factory(repomix_returncode=1)
        # Simulate repomix's stderr mentioning the budget on BOTH attempts —
        # even the compressed fallback doesn't fit.
        def _fake_run_with_budget_error(args, **kw):
            result = fake_run(args, **kw)
            if Path(args[0]).name == gf._REPOMIX_BIN or args[0] == gf._REPOMIX_BIN:
                return subprocess.CompletedProcess(args, 1, stdout="Error: token budget exceeded", stderr="")
            return result

        monkeypatch.setattr(gf.subprocess, "run", _fake_run_with_budget_error)
        with pytest.raises(gf.GithubFetchError, match="even compressed"):
            gf.clone_and_pack("pat", "acme", "widgets", "main")
        # clone + uncompressed attempt + compressed retry
        assert len(fake_run.calls) == 3

    def test_repomix_generic_failure(self, monkeypatch):
        fake_run = _fake_run_factory(repomix_returncode=1)
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        with pytest.raises(gf.GithubFetchError, match="repomix failed"):
            gf.clone_and_pack("pat", "acme", "widgets", "main")
        # A non-budget repomix failure must not retry — only clone + 1 pack attempt.
        assert len(fake_run.calls) == 2

    def test_repomix_timeout_raises_clean_error(self, monkeypatch):
        calls = {"n": 0}

        def _run(args, **kw):
            calls["n"] += 1
            if calls["n"] == 1:
                dest = Path(args[-1])
                dest.mkdir(parents=True, exist_ok=True)
                (dest / "README.md").write_text("hi")
                return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
            raise subprocess.TimeoutExpired(cmd="repomix", timeout=1)

        monkeypatch.setattr(gf.subprocess, "run", _run)
        with pytest.raises(gf.GithubFetchError, match="Timed out packing"):
            gf.clone_and_pack("pat", "acme", "widgets", "main")

    def test_strips_repomix_config_before_packing(self, monkeypatch):
        fake_run = _fake_run_factory(clone_files={
            "README.md": "hi",
            "repomix.config.json": '{"malicious": true}',
        })
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        gf.clone_and_pack("pat", "acme", "widgets", "main")
        pack_call = fake_run.calls[1]
        cwd = Path(pack_call["cwd"])
        assert not (cwd / "repomix.config.json").exists()

    def test_repomix_args_include_size_reduction_flags_and_style_pairing_intact(self, monkeypatch):
        fake_run = _fake_run_factory()
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        gf.clone_and_pack("pat", "acme", "widgets", "main")
        pack_args = fake_run.calls[1]["args"]
        for flag in ("--no-file-summary", "--no-directory-structure", "--remove-comments", "--remove-empty-lines"):
            assert flag in pack_args
        # Regression: --compress used to be inserted at a fixed index and
        # landed BETWEEN --style and its "markdown" value, corrupting the
        # pair. Not exercised here (compress=False), but --style must still
        # be immediately followed by "markdown" regardless of what else was
        # appended around it.
        style_idx = pack_args.index("--style")
        assert pack_args[style_idx + 1] == "markdown"

    def test_pat_never_appears_in_any_subprocess_argv(self, monkeypatch):
        pat = "ghp_super_secret_token_value"
        fake_run = _fake_run_factory()
        monkeypatch.setattr(gf.subprocess, "run", fake_run)
        gf.clone_and_pack(pat, "acme", "widgets", "main")
        for call in fake_run.calls:
            joined = " ".join(call["args"])
            assert pat not in joined, "PAT must never be passed via argv"
        # It should, however, be present (base64-encoded) in the clone call's env.
        clone_call = fake_run.calls[0]
        assert "GIT_CONFIG_VALUE_0" in clone_call["env"]
        assert clone_call["env"]["GIT_CONFIG_KEY_0"] == "http.extraHeader"


class TestFetchDefaultBranch:
    def test_returns_default_branch_from_repo_metadata(self, monkeypatch):
        monkeypatch.setattr(gf, "_get", lambda path, pat: {"default_branch": "develop"})
        assert gf.fetch_default_branch("pat", "acme", "widgets") == "develop"

    def test_falls_back_to_main_when_missing(self, monkeypatch):
        monkeypatch.setattr(gf, "_get", lambda path, pat: {})
        assert gf.fetch_default_branch("pat", "acme", "widgets") == "main"
