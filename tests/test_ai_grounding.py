"""Shared editable AI grounding-file helper tests."""

import pytest

from backend.app.services import ai_grounding


class FakeContextService:
    def __init__(self, files: dict[str, str] | None = None):
        self.files = files or {}

    def read_context_file(self, filename: str) -> str:
        return self.files.get(filename, "")


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
