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

from src.storage import StoragePath as Path

_BASE_CONTEXTSPEC = Path("contextspec")
_CONFIG_FILE      = _BASE_CONTEXTSPEC / ".apex-config.json"


def _build_context_dir(project_id: int) -> Path:
    return _BASE_CONTEXTSPEC / str(project_id) if project_id else _BASE_CONTEXTSPEC / "default"


def _init_paths(project_id: int) -> None:
    """Update all module-level path constants for the given project and reset caches."""
    global CONTEXT_DIR, MEMORY_BANK_FILE, FUNCTIONAL_SPEC_FILE, TECHNICAL_SPEC_FILE
    global VACCINES_FILE, STORY_INDEX_FILE, DRAFT_FILE, DESIGN_DRAFT_FILE, SESSION_FILE
    global DESIGN_BUNDLE_FILE
    global _story_index_cache, _context_initialized
    CONTEXT_DIR          = _build_context_dir(project_id)
    MEMORY_BANK_FILE     = CONTEXT_DIR / "memory-bank.md"
    FUNCTIONAL_SPEC_FILE = CONTEXT_DIR / "functional-spec.md"
    TECHNICAL_SPEC_FILE  = CONTEXT_DIR / "technical-spec.md"
    VACCINES_FILE        = CONTEXT_DIR / "vaccines.md"
    STORY_INDEX_FILE     = CONTEXT_DIR / "story-index.json"
    DRAFT_FILE           = CONTEXT_DIR / ".apex-draft.json"
    DESIGN_DRAFT_FILE    = CONTEXT_DIR / ".apex-design-draft.json"
    SESSION_FILE         = CONTEXT_DIR / ".apex-session.json"
    DESIGN_BUNDLE_FILE   = CONTEXT_DIR / "design-bundle.md"
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

_DESIGN_BUNDLE_TEMPLATE = """\
# Design Bundles

> Per-epic design artifacts (wireframes, user flow, component tree, technical spec).
> Written automatically by apex when a Phase 2 design is saved.

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


def save_config(project_id: int) -> None:
    """Persist the active project ID to the file share root so it survives container restarts."""
    try:
        _BASE_CONTEXTSPEC.mkdir(parents=True, exist_ok=True)
        data = load_config()
        data["project_id"] = project_id
        data.pop("auth_token", None)  # never persist auth tokens
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
        (DESIGN_BUNDLE_FILE,   _DESIGN_BUNDLE_TEMPLATE),
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
    content = MEMORY_BANK_FILE.read_text(encoding="utf-8")
    match = re.search(
        r"^##\s+Project\s+Concept[^\n]*\n(.*?)(?=^##\s|\Z)",
        content,
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    if not match:
        return ""
    text = match.group(1).strip()
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
            ("design-bundle.md",   DESIGN_BUNDLE_FILE),
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


def remove_story_from_specs(story_id: int) -> None:
    """Remove a story's blocks from functional-spec.md, technical-spec.md,
    and delete its proposal and BDD files."""
    if FUNCTIONAL_SPEC_FILE.exists():
        content = FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        content = re.sub(
            rf"\n### Story {story_id}:.*?(?=\n### |\n## |\Z)", "", content, flags=re.DOTALL,
        )
        content = re.sub(
            rf"\n## Story {story_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL,
        )
        FUNCTIONAL_SPEC_FILE.write_text(content, encoding="utf-8")
    if TECHNICAL_SPEC_FILE.exists():
        content = TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")
        content = re.sub(
            rf"\n### Technical Spec — Story {story_id}.*?(?=\n## |\n### |\Z)",
            "", content, flags=re.DOTALL,
        )
        TECHNICAL_SPEC_FILE.write_text(content, encoding="utf-8")
    if CONTEXT_DIR.exists():
        for path in CONTEXT_DIR.iterdir():
            if path.name.startswith(f"proposal_story_{story_id}_"):
                path.unlink(missing_ok=True)
        (CONTEXT_DIR / f"bdd_story_{story_id}.feature").unlink(missing_ok=True)


def remove_story_index_entries(story_ids: list[int]) -> None:
    """Remove entries for the given story IDs from the story index and spec files."""
    if not story_ids:
        return
    index = get_story_index()
    for sid in story_ids:
        index.pop(str(sid), None)
    _save_story_index(index)
    for story_id in story_ids:
        remove_story_from_specs(story_id)


def remove_epic_from_story_index(epic_id: int) -> None:
    """Remove all story index entries for epic_id, the epic sections from both
    spec files, and all associated proposal and BDD files."""
    index = get_story_index()
    keys = [k for k, e in index.items() if e.get("epic_id") == epic_id]
    story_ids = [int(k) for k in keys]
    for k in keys:
        del index[k]
    _save_story_index(index)
    # Remove ## Epic N: section (contains all nested stories) from both spec files
    for spec_file in (FUNCTIONAL_SPEC_FILE, TECHNICAL_SPEC_FILE):
        if spec_file.exists():
            content = spec_file.read_text(encoding="utf-8")
            content = re.sub(
                rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL,
            )
            spec_file.write_text(content, encoding="utf-8")
    # Remove this epic's section from design-bundle.md
    if DESIGN_BUNDLE_FILE.exists():
        bundle_content = DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")
        bundle_content = re.sub(
            rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", "", bundle_content, flags=re.DOTALL,
        )
        DESIGN_BUNDLE_FILE.write_text(bundle_content, encoding="utf-8")
    # Delete loose files for each story
    if CONTEXT_DIR.exists():
        for story_id in story_ids:
            for path in CONTEXT_DIR.iterdir():
                if path.name.startswith(f"proposal_story_{story_id}_"):
                    path.unlink(missing_ok=True)
            (CONTEXT_DIR / f"bdd_story_{story_id}.feature").unlink(missing_ok=True)


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


def save_design_draft(data: dict) -> None:
    """Persist the current Phase 2 design state so it survives a page refresh."""
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    DESIGN_DRAFT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_design_draft() -> dict | None:
    """Return the persisted Phase 2 design draft, or None if absent or corrupt."""
    if not DESIGN_DRAFT_FILE.exists():
        return None
    try:
        return json.loads(DESIGN_DRAFT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def clear_design_draft() -> None:
    """Delete the Phase 2 design draft file."""
    if DESIGN_DRAFT_FILE.exists():
        DESIGN_DRAFT_FILE.unlink()


def append_epic_design_bundle(
    epic_id: int,
    epic_title: str,
    wireframes: str,
    user_flow: str,
    component_tree: str,
    tech_spec: str,
) -> None:
    """Write the full design bundle for an epic to design-bundle.md.

    Replaces any existing block for this epic. Persists all four Phase 2 artifacts
    so they survive navigate-away and container restarts.
    """
    init_context()
    content = (
        DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")
        if DESIGN_BUNDLE_FILE.exists()
        else "# Design Bundles\n\n"
    )
    content = re.sub(
        rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL,
    )
    block = (
        f"\n## Epic {epic_id}: {epic_title}\n\n"
        f"**Locked at:** {_now()}\n\n"
        f"### Wireframes\n\n"
        f"```\n{wireframes.strip()}\n```\n\n"
        f"### User Flow\n\n"
        f"```\n{user_flow.strip()}\n```\n\n"
        f"### Component Tree\n\n"
        f"```\n{component_tree.strip()}\n```\n\n"
        f"### Technical Spec\n\n"
        f"```yaml\n{tech_spec.strip()}\n```\n"
    )
    DESIGN_BUNDLE_FILE.write_text(content.rstrip() + "\n" + block, encoding="utf-8")


def get_epic_design_bundle(epic_id: int) -> dict | None:
    """Return the saved design bundle for an epic, or None if not yet saved."""
    init_context()
    if not DESIGN_BUNDLE_FILE.exists():
        return None
    content = DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")
    match = re.search(
        rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", content, flags=re.DOTALL,
    )
    if not match:
        return None
    block = match.group(0)

    def _extract(label: str, lang: str = "") -> str:
        m = re.search(rf"### {label}\n\n```{lang}\n(.*?)\n```", block, re.DOTALL)
        return m.group(1).strip() if m else ""

    return {
        "wireframes":      _extract("Wireframes"),
        "user_flow":       _extract("User Flow"),
        "component_tree":  _extract("Component Tree"),
        "tech_spec":       _extract("Technical Spec", "yaml"),
    }


def get_other_epics_design_context(exclude_epic_id: int) -> str:
    """Return a prompt-ready block of all saved design bundles except exclude_epic_id.

    Used by the AI to maintain cross-epic consistency — components, wireframe patterns,
    and user flows from already-locked epics are injected as binding constraints.
    Returns empty string when no other epics have saved designs.
    """
    init_context()
    if not DESIGN_BUNDLE_FILE.exists():
        return ""
    content = DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")

    # Find all epic block boundaries (start positions + ids + titles)
    headers = list(re.finditer(r"\n## Epic (\d+): (.+?)\n", content))
    if not headers:
        return ""

    component_sections: list[str] = []
    wireframe_sections: list[str] = []
    flow_sections: list[str] = []

    for i, header in enumerate(headers):
        epic_id = int(header.group(1))
        if epic_id == exclude_epic_id:
            continue
        epic_title = header.group(2).strip()
        start = header.start()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(content)
        block = content[start:end]

        def _extract(label: str, lang: str = "", _block: str = block) -> str:
            m = re.search(rf"### {label}\n\n```{lang}\n(.*?)\n```", _block, re.DOTALL)
            return m.group(1).strip() if m else ""

        ct = _extract("Component Tree")
        wf = _extract("Wireframes")
        uf = _extract("User Flow")

        if ct:
            component_sections.append(f"### Epic {epic_id}: {epic_title}\n{ct}")
        if wf:
            wireframe_sections.append(f"### Epic {epic_id}: {epic_title}\n{wf}")
        if uf:
            flow_sections.append(f"### Epic {epic_id}: {epic_title}\n{uf}")

    if not component_sections and not wireframe_sections and not flow_sections:
        return ""

    parts: list[str] = []
    if component_sections:
        parts.append(
            "**Existing Component Architecture"
            " (DO NOT DUPLICATE — reuse and reference these):**\n"
            + "\n\n".join(component_sections)
        )
    if wireframe_sections:
        parts.append(
            "**Existing Wireframe Patterns"
            " (maintain visual and layout consistency with these):**\n"
            + "\n\n".join(wireframe_sections)
        )
    if flow_sections:
        parts.append(
            "**Existing User Flows"
            " (new flows must connect coherently — reuse shared states/nodes):**\n"
            + "\n\n".join(flow_sections)
        )
    return "\n\n".join(parts)


def write_tech_stack(tech_stack: str) -> None:
    """Replace the ## Tech Stack section in memory-bank.md with tech_stack.

    Uses regex to find and replace content between ## Tech Stack and the next ## section.
    Appends the section if absent. Never touches other sections.
    """
    content = read_context_file("memory-bank.md")
    new_section = f"## Tech Stack\n\n{tech_stack.strip()}\n"
    replaced, count = re.subn(
        r"^## Tech Stack[^\n]*\n.*?(?=^## |\Z)",
        new_section,
        content,
        count=1,
        flags=re.MULTILINE | re.DOTALL,
    )
    if count == 0:
        replaced = content.rstrip() + f"\n\n{new_section}"
    write_context_file("memory-bank.md", replaced)


def append_epic_technical_spec(
    epic_id: int,
    epic_title: str,
    story_ids: list[int],
    spec: str,
) -> None:
    """Write a unified technical spec block for an entire epic to technical-spec.md.

    Replaces any existing ## Epic {epic_id}: block, then appends the new one.
    Transitions all story_ids to design_locked in the story index.
    """
    init_context()
    content = TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")

    # Remove existing block for this epic (header through next ## or EOF).
    content = re.sub(
        rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)",
        "",
        content,
        flags=re.DOTALL,
    )

    block = (
        f"\n## Epic {epic_id}: {epic_title}\n\n"
        f"### Unified Technical Spec\n\n"
        f"**Locked at:** {_now()}\n\n"
        f"```yaml\n{spec.strip()}\n```\n"
    )
    TECHNICAL_SPEC_FILE.write_text(content.rstrip() + "\n" + block, encoding="utf-8")

    for story_id in story_ids:
        upsert_story_index(story_id, phase_status="design_locked", has_tech_spec=True)


def append_memory_bank_design(
    epic_id: int,
    epic_title: str,
    prototype_summary: str,
    tech_spec_summary: str,
) -> None:
    """Append a design decision entry under ## Design Decisions in memory-bank.md.

    Creates the section if absent. Never touches ## Tech Stack, ## Architecture
    Principles, or ## Project Concept.
    """
    content = read_context_file("memory-bank.md")
    entry = (
        f"\n### Epic {epic_id}: {epic_title}\n"
        f"**Locked at:** {_now()}\n"
        f"**Visual Design:** {prototype_summary[:200]}\n"
        f"**Architecture:** {tech_spec_summary[:200]}\n"
    )
    if "## Design Decisions" in content:
        content = content.rstrip() + "\n" + entry
    else:
        content = content.rstrip() + "\n\n## Design Decisions\n" + entry
    write_context_file("memory-bank.md", content)


_TEMPLATES: dict[str, str] = {
    "memory-bank.md":     _MEMORY_BANK_TEMPLATE,
    "functional-spec.md": _FUNCTIONAL_SPEC_TEMPLATE,
    "technical-spec.md":  _TECHNICAL_SPEC_TEMPLATE,
    "vaccines.md":        _VACCINES_TEMPLATE,
    "design-bundle.md":   _DESIGN_BUNDLE_TEMPLATE,
}


def read_context_file(filename: str) -> str:
    """Return the content of a named context file, or '' if missing."""
    init_context()
    path = CONTEXT_DIR / filename
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def write_context_file(filename: str, content: str) -> None:
    """Overwrite a named context file with new content."""
    init_context()
    (CONTEXT_DIR / filename).write_text(content, encoding="utf-8")


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
    MEMORY_BANK_FILE.write_text(_MEMORY_BANK_TEMPLATE,       encoding="utf-8")
    FUNCTIONAL_SPEC_FILE.write_text(_FUNCTIONAL_SPEC_TEMPLATE, encoding="utf-8")
    TECHNICAL_SPEC_FILE.write_text(_TECHNICAL_SPEC_TEMPLATE,  encoding="utf-8")
    VACCINES_FILE.write_text(_VACCINES_TEMPLATE,             encoding="utf-8")
    DESIGN_BUNDLE_FILE.write_text(_DESIGN_BUNDLE_TEMPLATE,   encoding="utf-8")
    _save_story_index({})
    clear_draft()
    _context_initialized = False


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
