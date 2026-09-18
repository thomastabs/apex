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


# HTML comments and ATX headings are the only things the unpopulated
# github-context.md / figma-context.md templates are made of, so stripping
# both is what separates "never synced" from "holds a real pack".
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_ATX_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}[^\n]*$", re.MULTILINE)


def context_file_is_populated(text: str) -> bool:
    """True when a synced context file holds real content, not its placeholder.

    Detects the placeholder STRUCTURALLY (nothing but a heading and HTML
    comments) rather than whitelisting some heading the packer is expected to
    emit. Both previous whitelist checks were wrong against production output:

      - "## File Tree" never appears in repomix output at all. It only ever
        existed in this project's own template comment text.
      - "# Directory Structure" is real repomix markdown, but github_fetch's
        _run_repomix passes --no-directory-structure on every single pack, so
        it is suppressed in exactly the output this check has to recognise.

    Either way the file read as unpopulated and Phase 6 blanked real code.
    A structural check cannot drift out of sync with repomix's flags: real
    packed content always leaves file bodies behind once headings and
    comments are removed, and a template never does.
    """
    body = _HTML_COMMENT_RE.sub("", text or "")
    body = _ATX_HEADING_RE.sub("", body)
    return bool(body.strip())


def is_custom_context_file(filename: str) -> bool:
    return (
        filename.startswith("wiki-")
        and filename.endswith(".md")
        and "/" not in filename
        and "\\" not in filename
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.md", filename) is not None
    )


def _read_agent_file(context: ContextService, filename: str) -> str:
    stored = context.read_agent_file(filename).strip()
    if stored:
        return stored
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
            content = _read_agent_file(context, name).strip()
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
