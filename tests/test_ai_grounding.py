"""Shared editable AI grounding-file helper tests."""

import pytest

from backend.app.services import ai_grounding


class FakeContextService:
    def __init__(self, files: dict[str, str] | None = None, agent_files: dict[str, str] | None = None):
        self.files = files or {}
        self.agent_files = agent_files or {}

    def read_context_file(self, filename: str) -> str:
        return self.files.get(filename, "")

    def read_agent_file(self, filename: str) -> str:
        return self.agent_files.get(filename, "")


def test_extra_context_block_reads_context_custom_wiki_and_agent_files(monkeypatch, tmp_path):
    monkeypatch.setattr(ai_grounding, "REPO_ROOT", tmp_path)
    (tmp_path / "AGENTS.md").write_text("# Agents\n\n- Use project rules.", encoding="utf-8")
    context = FakeContextService({
        "decisions.md": "# Decisions\n\n- Prefer FastAPI.",
        "wiki-integration-note.md": "# Integration Note\n\nTaiga wiki content.",
    })

    block = ai_grounding.extra_context_block(
        context,
        ["decisions.md", "wiki-integration-note.md", "AGENTS.md"],
    )

    assert "## Additional Grounding Files" in block
    assert "### decisions.md" in block
    assert "Prefer FastAPI" in block
    assert "### wiki-integration-note.md" in block
    assert "Taiga wiki content" in block
    assert "### AGENTS.md" in block
    assert "Use project rules" in block


def test_extra_context_block_rejects_unknown_files():
    with pytest.raises(ai_grounding.GroundingValidationError, match="Unknown extra context file"):
        ai_grounding.extra_context_block(FakeContextService(), ["../../secret.md"])


def test_extra_context_block_clips_large_files(monkeypatch):
    monkeypatch.setattr(ai_grounding, "MAX_EXTRA_CONTEXT_CHARS_PER_FILE", 20)
    context = FakeContextService({"decisions.md": "x" * 40})

    block = ai_grounding.extra_context_block(context, ["decisions.md"])

    assert "x" * 20 in block
    assert "x" * 21 not in block
    assert "[truncated]" in block


def test_extra_context_block_prefers_stored_agent_file(monkeypatch, tmp_path):
    monkeypatch.setattr(ai_grounding, "REPO_ROOT", tmp_path)
    context = FakeContextService(agent_files={"AGENTS.md": "# Stored Agents\n\nUse Apex storage."})

    block = ai_grounding.extra_context_block(context, ["AGENTS.md"])

    assert "Use Apex storage" in block


# ---------------------------------------------------------------------------
# context_file_is_populated
#
# Two production bugs came from whitelisting a heading here instead of asking
# the structural question. Phase 6 keyed on a heading a real pack never has
# (blanking real code, conformance 0/100); Phase 2/5 keyed on a leading
# "<!--" the template does not actually start with (so the empty placeholder
# counted as synced). These pin both directions.
# ---------------------------------------------------------------------------

# One real, valid shape of production output (--no-file-summary drops the
# preamble; a directory-structure tree may or may not precede "# Files"
# depending on github_fetch's current pack flags - context_file_is_populated
# does not depend on either, which is the property this fixture exercises).
_REAL_PACK = "# Files\n\n## File: src/app.ts\n```typescript\nexport const x = 1;\n```\n"


def test_unpopulated_template_is_not_populated():
    from src.context_manager import _FIGMA_CONTEXT_TEMPLATE, _GITHUB_CONTEXT_TEMPLATE

    # The template opens with "# GitHub Repository Context", NOT "<!--", which
    # is why the old startswith("<!--") check reported it as synced.
    assert _GITHUB_CONTEXT_TEMPLATE.strip().startswith("<!--") is False
    assert ai_grounding.context_file_is_populated(_GITHUB_CONTEXT_TEMPLATE) is False
    assert ai_grounding.context_file_is_populated(_FIGMA_CONTEXT_TEMPLATE) is False


def test_real_repomix_pack_is_populated():
    assert ai_grounding.context_file_is_populated(_REAL_PACK) is True
    # Neither heading the two broken checks looked for is present.
    assert "# Directory Structure" not in _REAL_PACK
    assert "## File Tree" not in _REAL_PACK


def test_legacy_browser_fetched_context_is_populated():
    legacy = "# GitHub Repository Context\n\n## File Tree\n\n```\nsrc/app.ts\n```\n"
    assert ai_grounding.context_file_is_populated(legacy) is True


def test_empty_and_headings_only_are_not_populated():
    assert ai_grounding.context_file_is_populated("") is False
    assert ai_grounding.context_file_is_populated("   \n\n") is False
    # A pack that matched no files at all is not usable context either.
    assert ai_grounding.context_file_is_populated("# Files\n") is False
