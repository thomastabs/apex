"""Shared pytest fixtures for apex tests."""

import pytest


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    """Patch context_manager to use an isolated tmp directory for each test.

    Resets module-level caches (_story_index_cache, _context_initialized) so
    tests never bleed state into each other.
    """
    from src import context_manager as cm

    ctx_dir = tmp_path / "contextspec"
    ctx_dir.mkdir()

    monkeypatch.setattr(cm, "CONTEXT_DIR",          ctx_dir)
    monkeypatch.setattr(cm, "MEMORY_BANK_FILE",     ctx_dir / "memory-bank.md")
    monkeypatch.setattr(cm, "FUNCTIONAL_SPEC_FILE", ctx_dir / "functional-spec.md")
    monkeypatch.setattr(cm, "TECHNICAL_SPEC_FILE",  ctx_dir / "technical-spec.md")
    monkeypatch.setattr(cm, "VACCINES_FILE",        ctx_dir / "vaccines.md")
    monkeypatch.setattr(cm, "STORY_INDEX_FILE",     ctx_dir / "story-index.json")
    monkeypatch.setattr(cm, "DRAFT_FILE",           ctx_dir / ".apex-draft.json")
    monkeypatch.setattr(cm, "DESIGN_DRAFT_FILE",   ctx_dir / ".apex-design-draft.json")
    monkeypatch.setattr(cm, "SESSION_FILE",         ctx_dir / ".apex-session.json")
    monkeypatch.setattr(cm, "DESIGN_BUNDLE_FILE",  ctx_dir / "design-bundle.md")
    monkeypatch.setattr(cm, "_story_index_cache",   None)
    monkeypatch.setattr(cm, "_context_initialized", False)

    return cm
