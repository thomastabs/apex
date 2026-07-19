"""Shared editable AI grounding-file support."""

import re
from pathlib import Path

from backend.app.services.context_service import ContextService

MAX_EXTRA_CONTEXT_CHARS_PER_FILE = 20_000
MAX_EXTRA_CONTEXT_TOTAL_CHARS = 60_000

CONTEXT_GROUNDING_FILES = {
    "project-concept.md",
    "tech-stack.md",
    "functional-spec.md",
    "technical-spec.md",
    "constraints.md",
    "fix-log.md",
    "decisions.md",
    "design-bundle.md",
    "runtime-spec.md",
    "github-context.md",
    "figma-context.md",
}
AGENT_GROUNDING_FILES = {
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "GEMINI.md",
}
REPO_ROOT = Path(__file__).resolve().parents[3]


class GroundingValidationError(ValueError):
    """Raised when a selected grounding file is invalid for an AI call."""


def is_custom_context_file(filename: str) -> bool:
    return (
        filename.startswith("wiki-")
        and filename.endswith(".md")
        and "/" not in filename
        and "\\" not in filename
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.md", filename) is not None
    )


def _read_agent_file(filename: str) -> str:
    path = (REPO_ROOT / filename).resolve()
    if path.parent != REPO_ROOT:
        raise GroundingValidationError(f"Invalid extra context file: {filename}")
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise GroundingValidationError(f"Agent context file must be UTF-8 text: {filename}") from exc


def extra_context_block(context: ContextService, filenames: list[str] | None) -> str:
    if not filenames:
        return ""
    seen: set[str] = set()
    total = 0
    sections: list[str] = []
    for filename in filenames:
        name = filename.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        if name in CONTEXT_GROUNDING_FILES or is_custom_context_file(name):
            content = context.read_context_file(name).strip()
        elif name in AGENT_GROUNDING_FILES:
            content = _read_agent_file(name).strip()
        else:
            raise GroundingValidationError(f"Unknown extra context file: {name}")
        if not content:
            continue
        remaining = MAX_EXTRA_CONTEXT_TOTAL_CHARS - total
        if remaining <= 0:
            break
        clipped = content[: min(len(content), MAX_EXTRA_CONTEXT_CHARS_PER_FILE, remaining)]
        total += len(clipped)
        suffix = "\n\n[truncated]" if len(clipped) < len(content) else ""
        sections.append(f"### {name}\n\n{clipped}{suffix}")
    if not sections:
        return ""
    return "\n\n## Additional Grounding Files\n\n" + "\n\n".join(sections)


def with_extra_context(context: ContextService, text: str, filenames: list[str] | None) -> str:
    return (text or "") + extra_context_block(context, filenames)
