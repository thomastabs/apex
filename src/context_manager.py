"""
context_manager.py
Manages read/write operations on the contextspec/ artefacts:

  memory-bank.md       — architecture rules, tech stack, enterprise policies (Tech Lead only)
  functional-spec.md   — per-story Gherkin Acceptance Criteria (locked on push)
  technical-spec.md    — per-story technical contracts (OpenAPI / DB schema)
  vaccines.md          — permanent vaccine records for diagnosed bugs (Fix-Apex output only)
  story-index.json     — machine-readable index of all stories and their phase status
"""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

_BASE_CONTEXTSPEC = Path("contextspec")
_CONFIG_FILE      = _BASE_CONTEXTSPEC / ".apex-config.json"


def _build_context_dir(project_id: int) -> Path:
    return _BASE_CONTEXTSPEC / str(project_id) if project_id else _BASE_CONTEXTSPEC / "default"


def _init_paths(project_id: int) -> None:
    """Update all module-level path constants for the given project and reset caches."""
    global CONTEXT_DIR, MEMORY_BANK_FILE, FUNCTIONAL_SPEC_FILE, TECHNICAL_SPEC_FILE
    global VACCINES_FILE, STORY_INDEX_FILE, DRAFT_FILE, SESSION_FILE
    global _story_index_cache, _context_initialized
    CONTEXT_DIR          = _build_context_dir(project_id)
    MEMORY_BANK_FILE     = CONTEXT_DIR / "memory-bank.md"
    FUNCTIONAL_SPEC_FILE = CONTEXT_DIR / "functional-spec.md"
    TECHNICAL_SPEC_FILE  = CONTEXT_DIR / "technical-spec.md"
    VACCINES_FILE        = CONTEXT_DIR / "vaccines.md"
    STORY_INDEX_FILE     = CONTEXT_DIR / "story-index.json"
    DRAFT_FILE           = CONTEXT_DIR / ".apex-draft.json"
    SESSION_FILE         = CONTEXT_DIR / ".apex-session.json"
    _story_index_cache   = None
    _context_initialized = False


# Module-level cache for the story index — avoids a file read on every sidebar render.
# Invalidated by _save_story_index() so rebuild/upsert calls always keep it current.
# WARNING: module-level state is shared across all Streamlit sessions in the same
# Python process. Fine for single-user use; multi-user deployments need per-session storage.
_story_index_cache: dict | None = None

# Guards init_context() so filesystem checks run once per process, not on every AI call.
_context_initialized: bool = False

# Initialise all path globals from env so the correct project dir is used from first import.
_init_paths(int(os.getenv("TAIGA_PROJECT_ID") or "0"))

_MEMORY_BANK_TEMPLATE = """\
# Memory Bank

> Immutable architecture rules, tech stack decisions, and enterprise policies.
> Edited only by the Tech Lead.

## Project Concept

<!-- Describe the project's purpose, target users, and core value proposition. -->

## Tech Stack

<!-- Fill in the project's language, frameworks, libraries, and runtime environment. -->

## Architecture Principles

<!-- Document the core architectural decisions and constraints for this project. -->
"""

_FUNCTIONAL_SPEC_TEMPLATE = """\
# Functional Specification

> Per-story Gherkin Acceptance Criteria.
> Appended automatically by apex after human approval.

"""

_TECHNICAL_SPEC_TEMPLATE = """\
# Technical Specification

> Per-story technical contracts (OpenAPI / DB schema).
> Appended automatically by apex after human approval.

"""

_VACCINES_TEMPLATE = """\
# Vaccine Records

> Permanent log of diagnosed bugs. Prevents the AI from hallucinating the same error twice.
> Appended automatically by apex after a Fix-Apex is resolved.

"""

# Phase status values — ordered by SDLC progression.
PHASE_STATUSES = (
    "gherkin_locked",  # Phase 1 complete: Gherkin approved and locked
    "design_locked",   # Phase 2 complete: Technical Spec generated and locked
    "implementation",  # Phase 3: Coding proposals / tasks generated
    "qa",              # Phase 4: BDD tests generated
    "deployed",        # Phase 5: Deployed to production
)


# ---------------------------------------------------------------------------
# Project switching
# ---------------------------------------------------------------------------

def set_active_project(project_id: int) -> None:
    """Switch all context paths to the given Taiga project's subdirectory and reset caches.

    Called by taiga_adapter.set_active_project() whenever the user changes project.
    Each project gets its own contextspec/<project_id>/ subdirectory so context
    files never bleed across projects.
    """
    _init_paths(project_id)
    save_config(project_id)


def is_project_selected() -> bool:
    """Return True when a real Taiga project is active (not the fallback default dir)."""
    return CONTEXT_DIR.name != "default"


def save_config(project_id: int, auth_token: str = "") -> None:
    """Persist non-sensitive state to the file share root so it survives container restarts.

    Merges into the existing config file so callers that only supply project_id
    don't accidentally erase a previously saved auth_token, and vice versa.
    The auth_token is a short-lived session token, not a password — safe to store
    on the file share alongside the context files.
    """
    try:
        _BASE_CONTEXTSPEC.mkdir(parents=True, exist_ok=True)
        data = load_config()          # preserve any fields we're not updating
        data["project_id"] = project_id
        if auth_token:
            data["auth_token"] = auth_token
        _CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass  # non-fatal — in-memory state is still correct


def load_config() -> dict:
    """Return the persisted config dict, or {} if the file is missing or corrupt."""
    if not _CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def reset_cache() -> None:
    """Reset module-level read caches without changing the active project paths.

    Useful when the underlying files may have changed externally (e.g. in tests).
    """
    global _context_initialized, _story_index_cache
    _context_initialized = False
    _story_index_cache   = None


# ---------------------------------------------------------------------------
# Initialisation & migrations
# ---------------------------------------------------------------------------

def init_context() -> None:
    """Create spec files with standard templates if they do not exist, then run migrations."""
    global _context_initialized
    if _context_initialized:
        return
    if not is_project_selected():
        return  # no project chosen yet — do not create contextspec/default/ files
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    for path, template in [
        (MEMORY_BANK_FILE,     _MEMORY_BANK_TEMPLATE),
        (FUNCTIONAL_SPEC_FILE, _FUNCTIONAL_SPEC_TEMPLATE),
        (TECHNICAL_SPEC_FILE,  _TECHNICAL_SPEC_TEMPLATE),
        (VACCINES_FILE,        _VACCINES_TEMPLATE),
    ]:
        if not path.exists():
            path.write_text(template, encoding="utf-8")
    _migrate_vaccine_records()
    if not STORY_INDEX_FILE.exists():
        rebuild_story_index()
    _context_initialized = True


def _migrate_vaccine_records() -> None:
    """One-time migration: move the # Vaccine Records section out of memory-bank.md.

    Older memory-bank.md files had a '# Vaccine Records' section appended at the bottom.
    This function detects it, strips it from memory-bank.md, and moves any real records
    (## Vaccine # entries) into vaccines.md.  Idempotent — safe to call on every init.
    """
    if not MEMORY_BANK_FILE.exists() or not VACCINES_FILE.exists():
        return

    content = MEMORY_BANK_FILE.read_text(encoding="utf-8")
    heading_pos = content.find("\n# Vaccine Records")
    if heading_pos == -1:
        return  # already migrated or never had the section

    vaccine_section = content[heading_pos:]

    # Walk back to include the preceding --- separator if one is present.
    prefix = content[:heading_pos].rstrip()
    if prefix.endswith("---"):
        prefix = prefix[:-3].rstrip()

    MEMORY_BANK_FILE.write_text(prefix + "\n", encoding="utf-8")

    records_match = re.search(r"## Vaccine #.*", vaccine_section, re.DOTALL)
    if records_match:
        vaccines_content = VACCINES_FILE.read_text(encoding="utf-8")
        VACCINES_FILE.write_text(
            vaccines_content.rstrip() + "\n" + records_match.group(0).rstrip() + "\n",
            encoding="utf-8",
        )


# ---------------------------------------------------------------------------
# Phase-scoped context builders — use these for AI prompt construction
# ---------------------------------------------------------------------------

def get_context_for_phase(phase: int, story_id: int | None = None) -> str:
    """Return the context slice appropriate for a given SDLC phase.

    Phase 1 — Requirements:   Memory Bank only (Project Concept + arch rules)
    Phase 2 — Design:         Memory Bank + story Gherkin
    Phase 3 — Implementation: Memory Bank + story Gherkin + story Technical Spec
    Phase 4 — QA/Testing:     Story Gherkin only
    Phase 5 — Deployment:     Memory Bank + story Technical Spec
    Phase 6 — Maintenance:    Empty string — Context Isolation Rule enforced here

    Feeding the entire project context to the AI is prohibited by the framework:
    it causes architectural hallucinations.  Always call this function rather than
    read_context() when building AI prompts.
    """
    init_context()
    mb      = get_memory_bank()
    gherkin = get_story_gherkin(story_id)        if story_id is not None else ""
    tech    = get_story_technical_spec(story_id) if story_id is not None else ""

    if phase == 1:
        return mb
    if phase == 2:
        return _join(mb, gherkin)
    if phase == 3:
        return _join(mb, gherkin, tech)
    if phase == 4:
        return gherkin
    if phase == 5:
        return _join(mb, tech)
    if phase == 6:
        # Context Isolation Rule — Fix-Apex AI must never receive full project context.
        return ""
    return mb


def _join(*parts: str) -> str:
    return "\n\n---\n\n".join(p for p in parts if p.strip())


# ---------------------------------------------------------------------------
# Granular readers
# ---------------------------------------------------------------------------

def get_memory_bank() -> str:
    """Return memory-bank.md content (architecture rules only, without Vaccine Records)."""
    init_context()
    return MEMORY_BANK_FILE.read_text(encoding="utf-8").strip() if MEMORY_BANK_FILE.exists() else ""


def get_vaccines() -> str:
    """Return vaccines.md content."""
    init_context()
    return VACCINES_FILE.read_text(encoding="utf-8").strip() if VACCINES_FILE.exists() else ""


def get_project_concept() -> str:
    """Return the Project Concept section from memory-bank.md, or '' if not set."""
    if not MEMORY_BANK_FILE.exists():
        return ""
    in_section = False
    section_lines: list[str] = []
    for line in MEMORY_BANK_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("## Project Concept"):
            in_section = True
            continue
        if in_section:
            if line.startswith("#") or line.startswith("---"):
                break
            section_lines.append(line)
    text = "\n".join(section_lines).strip()
    # Empty section or unfilled placeholder both count as "not set".
    if not text or text.startswith("<!--"):
        return ""
    return text


def get_story_gherkin(story_id: int) -> str:
    """Extract the Gherkin block for a specific story from functional-spec.md."""
    init_context()
    if not FUNCTIONAL_SPEC_FILE.exists():
        return ""
    content = FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
    # Try nested (### under an Epic) format first, then legacy flat ## format.
    for pattern in (
        rf"### Story {story_id}:.*?(?=\n### |\n## |\Z)",
        rf"## Story {story_id}:.*?(?=\n## |\Z)",
    ):
        match = re.search(pattern, content, re.DOTALL)
        if match:
            return match.group(0).strip()
    return ""


def get_story_technical_spec(story_id: int) -> str:
    """Extract the technical spec block for a specific story from technical-spec.md.

    Handles both nested (### under ## Epic) and flat formats.
    """
    init_context()
    if not TECHNICAL_SPEC_FILE.exists():
        return ""
    content = TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")
    pattern = rf"### Technical Spec — Story {story_id}.*?(?=\n## |\n### |\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0).strip() if match else ""


def get_context_sizes() -> dict[str, int]:
    """Return character counts for each context file (used for sidebar size indicator)."""
    return {
        name: (len(path.read_text(encoding="utf-8")) if path.exists() else 0)
        for name, path in [
            ("memory-bank.md",     MEMORY_BANK_FILE),
            ("functional-spec.md", FUNCTIONAL_SPEC_FILE),
            ("technical-spec.md",  TECHNICAL_SPEC_FILE),
            ("vaccines.md",        VACCINES_FILE),
        ]
    }


# ---------------------------------------------------------------------------
# Story index — machine-readable map of story_id → phase status
# ---------------------------------------------------------------------------

def get_story_index() -> dict[str, dict]:
    """Return the story index as {str(story_id): entry_dict}."""
    global _story_index_cache
    if _story_index_cache is None:
        if not STORY_INDEX_FILE.exists():
            return {}
        _story_index_cache = json.loads(STORY_INDEX_FILE.read_text(encoding="utf-8"))
    return _story_index_cache


def _save_story_index(index: dict[str, dict]) -> None:
    global _story_index_cache
    _story_index_cache = index
    STORY_INDEX_FILE.write_text(
        json.dumps(index, indent=2, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )


def upsert_story_index(story_id: int, **updates) -> None:
    """Create or update the index entry for a story.

    Only the fields passed as keyword arguments are modified; all other fields
    retain their current values.  Missing entries are created with defaults.

    Valid fields: epic_id, title, phase_status, has_gherkin, has_tech_spec,
                  has_proposal, has_bdd.
    """
    index = get_story_index()
    key   = str(story_id)
    entry = index.get(key, {
        "story_id":    story_id,
        "epic_id":     None,
        "title":       "",
        "phase_status": "gherkin_locked",
        "has_gherkin":  False,
        "has_tech_spec": False,
        "has_proposal":  False,
        "has_bdd":       False,
    })
    entry.update(updates)
    entry["story_id"] = story_id  # ensure the canonical field is always correct
    index[key] = entry
    _save_story_index(index)


def rebuild_story_index() -> dict[str, dict]:
    """Rebuild the story index from scratch by scanning all contextspec/ files.

    Parses functional-spec.md for stories (both flat ## Story and nested ### Story
    under ## Epic), then cross-references technical-spec.md and bdd_story_*.feature
    files to determine which phase each story has reached.

    Safe to call at any time — replaces the existing index entirely.
    """
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}

    # ── Parse functional-spec.md ────────────────────────────────────────────
    if FUNCTIONAL_SPEC_FILE.exists():
        content = FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        current_epic_id: int | None = None

        for line in content.splitlines():
            epic_m = re.match(r"^## Epic (\d+): (.+)$", line)
            if epic_m:
                current_epic_id = int(epic_m.group(1))
                continue

            nested_m = re.match(r"^### Story (\d+): (.+)$", line)
            if nested_m:
                sid = str(int(nested_m.group(1)))
                index[sid] = {
                    "story_id":    int(sid),
                    "epic_id":     current_epic_id,
                    "title":       nested_m.group(2).strip(),
                    "phase_status": "gherkin_locked",
                    "has_gherkin":  True,
                    "has_tech_spec": False,
                    "has_proposal":  False,
                    "has_bdd":       False,
                }
                continue

            flat_m = re.match(r"^## Story (\d+): (.+)$", line)
            if flat_m:
                sid = str(int(flat_m.group(1)))
                if sid not in index:  # don't overwrite a nested entry
                    index[sid] = {
                        "story_id":    int(sid),
                        "epic_id":     None,
                        "title":       flat_m.group(2).strip(),
                        "phase_status": "gherkin_locked",
                        "has_gherkin":  True,
                        "has_tech_spec": False,
                        "has_proposal":  False,
                        "has_bdd":       False,
                    }

    # ── Cross-reference technical-spec.md ───────────────────────────────────
    if TECHNICAL_SPEC_FILE.exists():
        tech = TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")
        for m in re.finditer(r"### Technical Spec.*?Story (\d+)", tech):
            sid = str(int(m.group(1)))
            if sid in index:
                index[sid]["has_tech_spec"] = True
                if index[sid]["phase_status"] == "gherkin_locked":
                    index[sid]["phase_status"] = "design_locked"

    # ── Cross-reference proposal_story_*_task_*.md files ────────────────────
    for path in CONTEXT_DIR.iterdir():
        if path.name.startswith("proposal_story_") and path.suffix == ".md":
            try:
                # Format: proposal_story_{story_id}_task_{task_id}.md
                stem_parts = path.stem.split("_")
                story_part_idx = stem_parts.index("story")
                sid = str(int(stem_parts[story_part_idx + 1]))
                if sid in index:
                    index[sid]["has_proposal"] = True
                    if index[sid]["phase_status"] in ("gherkin_locked", "design_locked"):
                        index[sid]["phase_status"] = "implementation"
            except (ValueError, IndexError):
                pass

    # ── Cross-reference bdd_story_*.feature files ────────────────────────────
    for path in CONTEXT_DIR.iterdir():
        if path.name.startswith("bdd_story_") and path.suffix == ".feature":
            try:
                sid = str(int(path.stem.removeprefix("bdd_story_")))
                if sid in index:
                    index[sid]["has_bdd"] = True
                    if index[sid]["phase_status"] in ("gherkin_locked", "design_locked", "implementation"):
                        index[sid]["phase_status"] = "qa"
            except ValueError:
                pass

    _save_story_index(index)
    return index


# ---------------------------------------------------------------------------
# Full context dump — for debugging and sidebar display ONLY
# ---------------------------------------------------------------------------

def read_context() -> str:
    """Return all spec files concatenated.

    WARNING: Do NOT use this for AI prompts — passing the full context violates the
    framework's Context Isolation principle and causes hallucinations.
    Use get_context_for_phase() instead.
    """
    init_context()
    return "\n\n---\n\n".join(
        p.read_text(encoding="utf-8")
        for p in (MEMORY_BANK_FILE, FUNCTIONAL_SPEC_FILE, TECHNICAL_SPEC_FILE, VACCINES_FILE)
        if p.exists()
    )


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def append_gherkin(
    story_id: int,
    story_title: str,
    gherkin: str,
    *,
    epic_id: int | None = None,
    epic_title: str = "",
) -> None:
    """Append a locked Gherkin block for a story to functional-spec.md.

    When epic_id is provided stories are nested under an ## Epic section;
    otherwise a legacy flat ## Story block is written.
    """
    init_context()
    content = FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")

    # Remove any previous entry for this story (handles both format versions).
    content = re.sub(rf"\n### Story {story_id}:.*?(?=\n### |\n## |\Z)", "", content, flags=re.DOTALL)
    content = re.sub(rf"\n## Story {story_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL)

    if epic_id is not None:
        story_block = (
            f"\n### Story {story_id}: {story_title}\n\n"
            f"**Status:** Gherkin Locked  \n"
            f"**Locked at:** {_now()}\n\n"
            f"```gherkin\n{gherkin.strip()}\n```\n"
        )
        epic_pattern = rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)"
        epic_match = re.search(epic_pattern, content, re.DOTALL)
        if epic_match:
            end = epic_match.end()
            content = content[:end].rstrip() + "\n" + story_block + content[end:]
        else:
            content = content.rstrip() + f"\n\n## Epic {epic_id}: {epic_title}\n" + story_block
    else:
        block = (
            f"\n## Story {story_id}: {story_title}\n\n"
            f"**Status:** Gherkin Locked  \n"
            f"**Locked at:** {_now()}\n\n"
            f"```gherkin\n{gherkin.strip()}\n```\n"
        )
        content = content.rstrip() + "\n" + block

    FUNCTIONAL_SPEC_FILE.write_text(content, encoding="utf-8")
    upsert_story_index(
        story_id,
        epic_id=epic_id,
        title=story_title,
        has_gherkin=True,
        phase_status="gherkin_locked",
    )


def append_technical_spec(
    story_id: int,
    spec: str,
    *,
    epic_id: int | None = None,
    epic_title: str = "",
) -> None:
    """Append a formal technical spec for a story to technical-spec.md.

    When epic_id is provided the entry is nested under an ## Epic section,
    mirroring the structure of functional-spec.md for consistent retrieval.
    """
    init_context()
    content = TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")

    # Remove any previous entry for this story.
    content = re.sub(
        rf"\n### Technical Spec — Story {story_id}.*?(?=\n## |\n### |\Z)",
        "", content, flags=re.DOTALL,
    )

    tech_block = (
        f"\n### Technical Spec — Story {story_id}\n\n"
        f"**Locked at:** {_now()}\n\n"
        f"```yaml\n{spec.strip()}\n```\n"
    )

    if epic_id is not None:
        epic_pattern = rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)"
        epic_match = re.search(epic_pattern, content, re.DOTALL)
        if epic_match:
            end = epic_match.end()
            content = content[:end].rstrip() + "\n" + tech_block + content[end:]
        else:
            content = content.rstrip() + f"\n\n## Epic {epic_id}: {epic_title}\n" + tech_block
    else:
        content = content.rstrip() + "\n" + tech_block

    TECHNICAL_SPEC_FILE.write_text(content, encoding="utf-8")
    upsert_story_index(story_id, has_tech_spec=True, phase_status="design_locked")


def append_vaccine_record(issue_id: int, root_cause: str, resolution_summary: str) -> None:
    """Append a permanent Vaccine Record for a resolved bug to vaccines.md."""
    init_context()
    content = VACCINES_FILE.read_text(encoding="utf-8")

    record = (
        f"\n## Vaccine #{issue_id} — {_now()}\n\n"
        f"**Root Cause:** {root_cause.strip()}\n\n"
        f"**Resolution:** {resolution_summary.strip()}\n"
    )

    content = content.rstrip() + "\n" + record + "\n"
    VACCINES_FILE.write_text(content, encoding="utf-8")


def save_proposal(story_id: int, task_id: int, proposal: str) -> Path:
    """Save a coding proposal to contextspec/proposal_story_<story_id>_task_<task_id>.md.

    Encoding story_id in the filename lets rebuild_story_index() recover has_proposal
    state without requiring a separate metadata file.
    """
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    path = CONTEXT_DIR / f"proposal_story_{story_id}_task_{task_id}.md"
    path.write_text(proposal, encoding="utf-8")
    upsert_story_index(story_id, has_proposal=True)
    return path


def save_bdd_tests(story_id: int, test_script: str) -> Path:
    """Save BDD test scripts to contextspec/bdd_story_<id>.feature and return the path."""
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    path = CONTEXT_DIR / f"bdd_story_{story_id}.feature"
    path.write_text(test_script, encoding="utf-8")
    upsert_story_index(story_id, has_bdd=True, phase_status="qa")
    return path


def load_session() -> dict:
    """Return the persisted apex session dict, or {} if missing or corrupt."""
    if not SESSION_FILE.exists():
        return {}
    try:
        return json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_session(updates: dict) -> None:
    """Merge updates into the persisted session file."""
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    data = load_session()
    data.update(updates)
    SESSION_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def save_draft(data: dict) -> None:
    """Persist the current Phase 1 elaboration state so it survives a page refresh."""
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    DRAFT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_draft() -> dict | None:
    """Return the persisted draft data, or None if no draft exists or it is corrupt."""
    if not DRAFT_FILE.exists():
        return None
    try:
        return json.loads(DRAFT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def clear_draft() -> None:
    """Delete the draft file (called after a successful push or manual reset)."""
    if DRAFT_FILE.exists():
        DRAFT_FILE.unlink()


_TEMPLATES: dict[str, str] = {
    "memory-bank.md":     _MEMORY_BANK_TEMPLATE,
    "functional-spec.md": _FUNCTIONAL_SPEC_TEMPLATE,
    "technical-spec.md":  _TECHNICAL_SPEC_TEMPLATE,
    "vaccines.md":        _VACCINES_TEMPLATE,
}


def reset_context_file(filename: str) -> None:
    """Reset a single context file to its blank template."""
    template = _TEMPLATES.get(filename)
    if template is None:
        return
    path = CONTEXT_DIR / filename
    if path.exists():
        path.write_text(template, encoding="utf-8")
    reset_cache()


def reset_context() -> None:
    """Reset all context files to their initial templates and clear the story index.

    Intended for test/demo purposes only — all locked Gherkin, technical specs,
    vaccine records, and index entries are permanently erased.
    """
    global _context_initialized
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    MEMORY_BANK_FILE.write_text(_MEMORY_BANK_TEMPLATE,     encoding="utf-8")
    FUNCTIONAL_SPEC_FILE.write_text(_FUNCTIONAL_SPEC_TEMPLATE, encoding="utf-8")
    TECHNICAL_SPEC_FILE.write_text(_TECHNICAL_SPEC_TEMPLATE,  encoding="utf-8")
    VACCINES_FILE.write_text(_VACCINES_TEMPLATE,           encoding="utf-8")
    _save_story_index({})
    clear_draft()
    _context_initialized = False


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
