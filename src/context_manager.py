"""
context_manager.py
Manages read/write operations on the contextspec/ artefacts:

  project-concept.md   — project purpose, target users, core value proposition (editable)
  tech-stack.md        — technology choices and architecture principles (Tech Lead only)
  functional-spec.md   — per-story Acceptance Criteria (locked on push)
  technical-spec.md    — per-story technical contracts (OpenAPI / DB schema)
  vaccines.md          — permanent vaccine records for diagnosed bugs (Fix-Apex output only)
  story-index.json     — machine-readable index of all stories and their phase status
"""

import contextvars
import json
import logging
import os
import re
from datetime import datetime, timezone

from src.storage import StoragePath as Path

_logger = logging.getLogger("apex.context_manager")

_BASE_CONTEXTSPEC = Path("contextspec")
_CONFIG_FILE      = _BASE_CONTEXTSPEC / ".apex-config.json"

# Per-request active project. Uses ContextVar so concurrent FastAPI requests on different projects are isolated.
_active_project_id: contextvars.ContextVar[int] = contextvars.ContextVar(
    "context_manager_project_id",
    default=int(os.getenv("TAIGA_PROJECT_ID") or "0"),
)


def _get_project_id() -> int:
    return _active_project_id.get()


def _context_dir(pid: int | None = None) -> Path:
    p = pid if pid is not None else _get_project_id()
    return _BASE_CONTEXTSPEC / str(p) if p else _BASE_CONTEXTSPEC / "default"


def _path(filename: str, pid: int | None = None) -> Path:
    return _context_dir(pid) / filename


def get_file_path(filename: str, pid: int | None = None) -> Path:
    """Public accessor for the resolved filesystem path of a context file."""
    return _path(filename, pid)


# Process-scoped per-project caches.  Keyed by project_id so concurrent requests
# on different projects never share or overwrite each other's in-memory state.
_story_index_caches:  dict[int, dict | None] = {}
_initialized_projects: set[int]              = set()




def __getattr__(name: str):
    """Dynamic module attribute access for path constants.

    Used by tests and legacy callers. Each call returns the path for the
    current ContextVar project so project isolation is maintained.
    """
    _filenames: dict[str, str] = {
        "PROJECT_CONCEPT_FILE": "project-concept.md",
        "TECH_STACK_FILE":      "tech-stack.md",
        "FUNCTIONAL_SPEC_FILE": "functional-spec.md",
        "TECHNICAL_SPEC_FILE":  "technical-spec.md",
        "VACCINES_FILE":        "vaccines.md",
        "STORY_INDEX_FILE":     "story-index.json",
        "DRAFT_FILE":           ".apex-draft.json",
        "DESIGN_DRAFT_FILE":    ".apex-design-draft.json",
        "SESSION_FILE":         ".apex-session.json",
        "DESIGN_BUNDLE_FILE":   "design-bundle.md",
    }
    if name in _filenames:
        return _path(_filenames[name])
    if name == "CONTEXT_DIR":
        return _context_dir()
    if name == "_context_initialized":
        return _get_project_id() in _initialized_projects
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


_PROJECT_CONCEPT_TEMPLATE = """\
# Project Concept

<!-- Describe the project's purpose, target users, and core value proposition. -->
"""

_TECH_STACK_TEMPLATE = """\
# Tech Stack

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
    """Switch the active project for the current request context and reset caches.

    Sets the ContextVar so all subsequent file operations in this request use
    contextspec/<project_id>/.  Each project has its own subdirectory so context
    files never bleed across projects.
    """
    previous = _active_project_id.get(0)
    _active_project_id.set(project_id)
    if project_id != previous:
        save_config(project_id)


def is_project_selected() -> bool:
    """Return True when a real Taiga project is active."""
    return _get_project_id() != 0


def save_ai_config(model: str) -> None:
    """Persist AI model preference to the shared config file."""
    try:
        _BASE_CONTEXTSPEC.mkdir(parents=True, exist_ok=True)
        data = load_config()
        data["ai_model"] = model
        _CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError as exc:
        _logger.warning("save_ai_config: failed to persist AI config: %s", exc)


def save_config(project_id: int) -> None:
    """Persist the active project ID to the file share root so it survives container restarts."""
    try:
        _BASE_CONTEXTSPEC.mkdir(parents=True, exist_ok=True)
        data = load_config()
        data["project_id"] = project_id
        data.pop("auth_token", None)  # never persist auth tokens
        _CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError as exc:
        _logger.warning("save_config: failed to persist project config: %s", exc)


def load_config() -> dict:
    """Return the persisted config dict, or {} if the file is missing or corrupt."""
    if not _CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _logger.warning("load_config: config file is corrupt (%s) — returning empty config", exc)
        return {}
    except OSError as exc:
        _logger.warning("load_config: failed to read config file (%s) — returning empty config", exc)
        return {}


def reset_cache() -> None:
    """Reset in-memory caches for the current project without changing active paths.

    Useful when the underlying files may have changed externally (e.g. in tests or
    after a story index rebuild via the API).
    """
    pid = _get_project_id()
    _initialized_projects.discard(pid)
    _story_index_caches.pop(pid, None)


# ---------------------------------------------------------------------------
# Initialisation & migrations
# ---------------------------------------------------------------------------

def init_context() -> None:
    """Create spec files with standard templates if they do not exist, then run migrations."""
    pid = _get_project_id()
    if pid in _initialized_projects:
        return
    if not is_project_selected():
        return  # no project chosen yet — do not create contextspec/default/ files
    _context_dir().mkdir(parents=True, exist_ok=True)
    _migrate_memory_bank()
    for filename, template in [
        ("project-concept.md", _PROJECT_CONCEPT_TEMPLATE),
        ("tech-stack.md",      _TECH_STACK_TEMPLATE),
        ("functional-spec.md", _FUNCTIONAL_SPEC_TEMPLATE),
        ("technical-spec.md",  _TECHNICAL_SPEC_TEMPLATE),
        ("vaccines.md",        _VACCINES_TEMPLATE),
        ("design-bundle.md",   _DESIGN_BUNDLE_TEMPLATE),
    ]:
        p = _path(filename)
        if not p.exists():
            p.write_text(template, encoding="utf-8")
    _migrate_vaccine_records()
    if not _path("story-index.json").exists():
        rebuild_story_index()
    _initialized_projects.add(pid)


def _migrate_memory_bank() -> None:
    """One-time migration: split legacy memory-bank.md into project-concept.md + tech-stack.md.

    If memory-bank.md exists and neither new file exists, extract the Project Concept
    and Tech Stack / Architecture Principles sections and write them to the new files,
    then delete memory-bank.md.  Idempotent — safe to call on every init.
    """
    mb = _path("memory-bank.md")
    pc = _path("project-concept.md")
    ts = _path("tech-stack.md")
    if not mb.exists():
        return
    if pc.exists() or ts.exists():
        return  # already migrated
    content = mb.read_text(encoding="utf-8")

    # Extract Project Concept section
    concept_match = re.search(
        r"^##\s+Project\s+Concept[^\n]*\n(.*?)(?=^##\s|\Z)",
        content, re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    concept_text = concept_match.group(1).strip() if concept_match else ""
    if not concept_text or concept_text.startswith("<!--"):
        concept_text = ""

    # Extract Tech Stack + Architecture Principles (everything from ## Tech Stack onward)
    stack_match = re.search(
        r"^##\s+Tech\s+Stack[^\n]*\n(.*?)(?=^## Project Concept|^# Vaccine|\Z)",
        content, re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    stack_raw = stack_match.group(0).strip() if stack_match else ""

    if concept_text:
        pc.write_text(f"# Project Concept\n\n{concept_text}\n", encoding="utf-8")
    else:
        pc.write_text(_PROJECT_CONCEPT_TEMPLATE, encoding="utf-8")

    if stack_raw:
        # Normalise heading level to H1 since it's now the whole file
        stack_raw = re.sub(r"^## Tech Stack", "# Tech Stack", stack_raw, count=1)
        ts.write_text(stack_raw + "\n", encoding="utf-8")
    else:
        ts.write_text(_TECH_STACK_TEMPLATE, encoding="utf-8")

    mb.unlink()
    _logger.info("_migrate_memory_bank: split memory-bank.md into project-concept.md + tech-stack.md")


def _migrate_vaccine_records() -> None:
    """One-time migration: move the # Vaccine Records section out of memory-bank.md.

    Legacy memory-bank.md files had a '# Vaccine Records' section appended at the bottom.
    No-op when memory-bank.md no longer exists (already migrated by _migrate_memory_bank).
    Idempotent — safe to call on every init.
    """
    mb = _path("memory-bank.md")
    vx = _path("vaccines.md")
    if not mb.exists() or not vx.exists():
        return

    content = mb.read_text(encoding="utf-8")
    heading_pos = content.find("\n# Vaccine Records")
    if heading_pos == -1:
        return  # already migrated or never had the section

    vaccine_section = content[heading_pos:]

    # Walk back to include the preceding --- separator if one is present.
    prefix = content[:heading_pos].rstrip()
    if prefix.endswith("---"):
        prefix = prefix[:-3].rstrip()

    mb.write_text(prefix + "\n", encoding="utf-8")

    records_match = re.search(r"## Vaccine #.*", vaccine_section, re.DOTALL)
    if records_match:
        vaccines_content = vx.read_text(encoding="utf-8")
        vx.write_text(
            vaccines_content.rstrip() + "\n" + records_match.group(0).rstrip() + "\n",
            encoding="utf-8",
        )


# ---------------------------------------------------------------------------
# Phase-scoped context builders — use these for AI prompt construction
# ---------------------------------------------------------------------------

def get_context_for_phase(phase: int, story_id: int | None = None) -> str:
    """Return the context slice appropriate for a given SDLC phase.

    Phase 1 — Requirements:   Project Concept + Tech Stack
    Phase 2 — Design:         Project Concept + Tech Stack + story Acceptance Criteria
    Phase 3 — Implementation: Project Concept + Tech Stack + Acceptance Criteria + Technical Spec
    Phase 4 — QA/Testing:     Story Acceptance Criteria only
    Phase 5 — Deployment:     Project Concept + Tech Stack + story Technical Spec
    Phase 6 — Maintenance:    Empty string — Context Isolation Rule enforced here

    Feeding the entire project context to the AI is prohibited by the framework:
    it causes architectural hallucinations.  Always call this function rather than
    read_context() when building AI prompts.
    """
    init_context()
    project_ctx = _join(get_project_concept(), get_tech_stack_content())
    gherkin     = get_story_gherkin(story_id)        if story_id is not None else ""
    tech        = get_story_technical_spec(story_id) if story_id is not None else ""

    if phase == 1:
        return project_ctx
    if phase == 2:
        return _join(project_ctx, gherkin)
    if phase == 3:
        return _join(project_ctx, gherkin, tech)
    if phase == 4:
        return gherkin
    if phase == 5:
        return _join(project_ctx, tech)
    if phase == 6:
        # Context Isolation Rule — Fix-Apex AI must never receive full project context.
        return ""
    return project_ctx


def _join(*parts: str) -> str:
    return "\n\n---\n\n".join(p for p in parts if p.strip())


# ---------------------------------------------------------------------------
# Granular readers
# ---------------------------------------------------------------------------

def get_tech_stack_content() -> str:
    """Return the user-written tech stack text from tech-stack.md.

    Extracts only the content between the '# Tech Stack' heading and the
    '## Architecture Principles' section (or EOF).  Returns '' when the file
    has not been filled in (placeholder comment only).
    """
    init_context()
    ts = _path("tech-stack.md")
    if not ts.exists():
        return ""
    content = ts.read_text(encoding="utf-8")
    match = re.search(
        r"^#\s+Tech\s+Stack[^\n]*\n(.*?)(?=^##\s+Architecture\s+Principles|\Z)",
        content, re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    if not match:
        return content.strip()
    text = match.group(1).strip()
    if not text or text.startswith("<!--"):
        return ""
    return text


def get_vaccines() -> str:
    """Return vaccines.md content."""
    init_context()
    vx = _path("vaccines.md")
    return vx.read_text(encoding="utf-8").strip() if vx.exists() else ""


def get_project_concept() -> str:
    """Return the content of project-concept.md, or '' if not yet filled in."""
    pc = _path("project-concept.md")
    if not pc.exists():
        return ""
    content = pc.read_text(encoding="utf-8")
    # Strip the heading line and any placeholder comment
    text = re.sub(r"^#\s+Project\s+Concept[^\n]*\n", "", content, count=1, flags=re.IGNORECASE).strip()
    if not text or text.startswith("<!--"):
        return ""
    return text


def get_story_gherkin(story_id: int) -> str:
    """Extract the Gherkin block for a specific story from functional-spec.md."""
    init_context()
    fs = _path("functional-spec.md")
    if not fs.exists():
        return ""
    content = fs.read_text(encoding="utf-8")
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
    ts = _path("technical-spec.md")
    if not ts.exists():
        return ""
    content = ts.read_text(encoding="utf-8")
    pattern = rf"### Technical Spec — Story {story_id}.*?(?=\n## |\n### |\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0).strip() if match else ""


def get_context_sizes() -> dict[str, int]:
    """Return character counts for each context file (used for sidebar size indicator)."""
    return {
        name: (len(_path(name).read_text(encoding="utf-8")) if _path(name).exists() else 0)
        for name in (
            "project-concept.md",
            "tech-stack.md",
            "functional-spec.md",
            "technical-spec.md",
            "vaccines.md",
            "design-bundle.md",
        )
    }


# ---------------------------------------------------------------------------
# Story index — machine-readable map of story_id → phase status
# ---------------------------------------------------------------------------

def get_story_index() -> dict[str, dict]:
    """Return the story index as {str(story_id): entry_dict}."""
    pid = _get_project_id()
    if pid not in _story_index_caches:
        sif = _path("story-index.json")
        _story_index_caches[pid] = (
            json.loads(sif.read_text(encoding="utf-8")) if sif.exists() else {}
        )
    return _story_index_caches[pid]


def _save_story_index(index: dict[str, dict]) -> None:
    pid = _get_project_id()
    _story_index_caches[pid] = index
    _path("story-index.json").write_text(
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
    if "phase_status" in updates and updates["phase_status"] not in PHASE_STATUSES:
        raise ValueError(
            f"Invalid phase_status {updates['phase_status']!r}. Must be one of {PHASE_STATUSES}."
        )
    entry = index.get(key, {
        "story_id":    story_id,
        "epic_id":     None,
        "title":       "",
        "phase_status": updates.get("phase_status", "gherkin_locked"),
        "has_gherkin":  False,
        "has_tech_spec": False,
        "has_proposal":  False,
        "has_bdd":       False,
    })
    entry.update(updates)
    entry["story_id"] = story_id  # ensure the canonical field is always correct
    index[key] = entry
    _save_story_index(index)


def mark_story_deployed(story_id: int) -> None:
    """Set a story's phase_status to 'deployed' after Phase 5 deployment."""
    upsert_story_index(story_id, phase_status="deployed")


def remove_story_from_specs(story_id: int) -> None:
    """Remove a story's blocks from functional-spec.md, technical-spec.md,
    and delete its proposal and BDD files."""
    fs = _path("functional-spec.md")
    if fs.exists():
        content = fs.read_text(encoding="utf-8")
        content = re.sub(
            rf"\n### Story {story_id}:.*?(?=\n### |\n## |\Z)", "", content, flags=re.DOTALL,
        )
        content = re.sub(
            rf"\n## Story {story_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL,
        )
        fs.write_text(content, encoding="utf-8")
    ts = _path("technical-spec.md")
    if ts.exists():
        content = ts.read_text(encoding="utf-8")
        content = re.sub(
            rf"\n### Technical Spec — Story {story_id}.*?(?=\n## |\n### |\Z)",
            "", content, flags=re.DOTALL,
        )
        ts.write_text(content, encoding="utf-8")
    cd = _context_dir()
    if cd.exists():
        to_delete = [p for p in cd.iterdir() if p.name.startswith(f"proposal_story_{story_id}_")]
        for p in to_delete:
            p.unlink(missing_ok=True)
        (cd / f"bdd_story_{story_id}.feature").unlink(missing_ok=True)


def clear_story_index() -> None:
    """Wipe the story index entirely (all entries removed)."""
    _save_story_index({})
    reset_cache()


def reset_story_index_phase_statuses() -> None:
    """Reset all phase-derived flags in the story index back to their post-Phase-1 defaults.

    Called when context files are reset so phase readiness gates reflect the cleared state.
    Preserves story identity fields (story_id, epic_id, title, has_gherkin).
    """
    index = get_story_index()
    for entry in index.values():
        entry["has_tech_spec"] = False
        entry["has_proposal"] = False
        entry["has_bdd"] = False
        if entry.get("phase_status") not in ("gherkin_locked",):
            entry["phase_status"] = "gherkin_locked"
    _save_story_index(index)
    reset_cache()


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
    for spec_file in (_path("functional-spec.md"), _path("technical-spec.md")):
        if spec_file.exists():
            content = spec_file.read_text(encoding="utf-8")
            content = re.sub(
                rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", "", content, flags=re.DOTALL,
            )
            spec_file.write_text(content, encoding="utf-8")
    # Remove this epic's section from design-bundle.md
    db = _path("design-bundle.md")
    if db.exists():
        bundle_content = db.read_text(encoding="utf-8")
        bundle_content = re.sub(
            rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", "", bundle_content, flags=re.DOTALL,
        )
        db.write_text(bundle_content, encoding="utf-8")
    # Delete loose files for each story
    cd = _context_dir()
    if cd.exists():
        for story_id in story_ids:
            for p in cd.iterdir():
                if p.name.startswith(f"proposal_story_{story_id}_"):
                    p.unlink(missing_ok=True)
            (cd / f"bdd_story_{story_id}.feature").unlink(missing_ok=True)


def rebuild_story_index() -> dict[str, dict]:
    """Rebuild the story index from scratch by scanning all contextspec/ files.

    Parses functional-spec.md for stories (both flat ## Story and nested ### Story
    under ## Epic), then cross-references technical-spec.md and bdd_story_*.feature
    files to determine which phase each story has reached.

    Safe to call at any time — replaces the existing index entirely.
    """
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}

    # ── Parse functional-spec.md ────────────────────────────────────────────
    fs = _path("functional-spec.md")
    if fs.exists():
        content = fs.read_text(encoding="utf-8")
        current_epic_id: int | None = None
        current_epic_title: str = ""

        for line in content.splitlines():
            epic_m = re.match(r"^## Epic (\d+): (.+)$", line)
            if epic_m:
                current_epic_id = int(epic_m.group(1))
                current_epic_title = epic_m.group(2).strip()
                continue

            nested_m = re.match(r"^### Story (\d+): (.+)$", line)
            if nested_m:
                sid = str(int(nested_m.group(1)))
                index[sid] = {
                    "story_id":    int(sid),
                    "epic_id":     current_epic_id,
                    "epic_title":  current_epic_title,
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
    ts = _path("technical-spec.md")
    if ts.exists():
        tech = ts.read_text(encoding="utf-8")
        # Unified project design block (write_project_technical_spec): marks ALL stories.
        if re.search(r"^## Project Design\b", tech, re.MULTILINE):
            for sid, entry in index.items():
                entry["has_tech_spec"] = True
                if entry["phase_status"] == "gherkin_locked":
                    entry["phase_status"] = "design_locked"
        # Legacy per-story format: ### Technical Spec ... Story {id}
        for m in re.finditer(r"### Technical Spec.*?Story (\d+)", tech):
            sid = str(int(m.group(1)))
            if sid in index:
                index[sid]["has_tech_spec"] = True
                if index[sid]["phase_status"] == "gherkin_locked":
                    index[sid]["phase_status"] = "design_locked"
        # Per-epic format written by append_epic_technical_spec: ## Epic {id}: ...
        for m in re.finditer(r"^## Epic (\d+):", tech, re.MULTILINE):
            locked_epic_id = int(m.group(1))
            for sid, entry in index.items():
                if entry.get("epic_id") == locked_epic_id:
                    entry["has_tech_spec"] = True
                    if entry["phase_status"] == "gherkin_locked":
                        entry["phase_status"] = "design_locked"

    # ── Cross-reference proposal_story_*_task_*.md files ────────────────────
    for p in cd.iterdir():
        if p.name.startswith("proposal_story_") and p.suffix == ".md":
            try:
                stem_parts = p.stem.split("_")
                story_part_idx = stem_parts.index("story")
                sid = str(int(stem_parts[story_part_idx + 1]))
                if sid in index:
                    index[sid]["has_proposal"] = True
                    if index[sid]["phase_status"] in ("gherkin_locked", "design_locked"):
                        index[sid]["phase_status"] = "implementation"
            except (ValueError, IndexError):
                pass

    # ── Cross-reference bdd_story_*.feature files ────────────────────────────
    for p in cd.iterdir():
        if p.name.startswith("bdd_story_") and p.suffix == ".feature":
            try:
                sid = str(int(p.stem.removeprefix("bdd_story_")))
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
        _path(name).read_text(encoding="utf-8")
        for name in ("project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md", "vaccines.md")
        if _path(name).exists()
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
    fs = _path("functional-spec.md")
    content = fs.read_text(encoding="utf-8")

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

    fs.write_text(content, encoding="utf-8")
    upsert_story_index(
        story_id,
        epic_id=epic_id,
        epic_title=epic_title,
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
    ts = _path("technical-spec.md")
    content = ts.read_text(encoding="utf-8")

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

    ts.write_text(content, encoding="utf-8")
    upsert_story_index(story_id, has_tech_spec=True, phase_status="design_locked")


def append_vaccine_record(issue_id: int, root_cause: str, resolution_summary: str) -> None:
    """Append a permanent Vaccine Record for a resolved bug to vaccines.md."""
    init_context()
    vx = _path("vaccines.md")
    content = vx.read_text(encoding="utf-8")

    record = (
        f"\n## Vaccine #{issue_id} — {_now()}\n\n"
        f"**Root Cause:** {root_cause.strip()}\n\n"
        f"**Resolution:** {resolution_summary.strip()}\n"
    )

    vx.write_text(content.rstrip() + "\n" + record + "\n", encoding="utf-8")


def save_proposal(story_id: int, task_id: int, proposal: str) -> Path:
    """Save a coding proposal to contextspec/proposal_story_<story_id>_task_<task_id>.md.

    Encoding story_id in the filename lets rebuild_story_index() recover has_proposal
    state without requiring a separate metadata file.
    """
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"proposal_story_{story_id}_task_{task_id}.md"
    p.write_text(proposal, encoding="utf-8")
    upsert_story_index(story_id, has_proposal=True)
    return p


def proposal_exists(story_id: int, task_id: int) -> bool:
    """Return True if a saved proposal file exists for this story/task pair."""
    return (_context_dir() / f"proposal_story_{story_id}_task_{task_id}.md").exists()


def save_er_diagram(diagram: dict) -> None:
    """Persist the ER diagram React Flow JSON for the current project."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    _path("diagram-er.json").write_text(
        json.dumps(diagram, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def load_er_diagram() -> dict | None:
    """Return the ER diagram JSON, or None if not yet generated."""
    p = _path("diagram-er.json")
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_bdd_tests(story_id: int, test_script: str) -> Path:
    """Save BDD test scripts to contextspec/bdd_story_<id>.feature and return the path."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"bdd_story_{story_id}.feature"
    p.write_text(test_script, encoding="utf-8")
    upsert_story_index(story_id, has_bdd=True, phase_status="qa")
    return p


def load_session() -> dict:
    """Return the persisted apex session dict, or {} if missing or corrupt."""
    sf = _path("session.json")
    if not sf.exists():
        sf = _path(".apex-session.json")  # legacy name
    if not sf.exists():
        return {}
    try:
        return json.loads(sf.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_session(updates: dict) -> None:
    """Merge updates into the persisted session file."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    data = load_session()
    data.update(updates)
    _path(".apex-session.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def save_draft(data: dict) -> None:
    """Persist the current Phase 1 elaboration state so it survives a page refresh."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    _path(".apex-draft.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_draft() -> dict | None:
    """Return the persisted draft data, or None if no draft exists or it is corrupt."""
    df = _path(".apex-draft.json")
    if not df.exists():
        return None
    try:
        return json.loads(df.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def clear_draft() -> None:
    """Delete the draft file (called after a successful push or manual reset)."""
    df = _path(".apex-draft.json")
    if df.exists():
        df.unlink()


def save_design_draft(data: dict) -> None:
    """Persist the current Phase 2 design state so it survives a page refresh."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    _path(".apex-design-draft.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_design_draft() -> dict | None:
    """Return the persisted Phase 2 design draft, or None if absent or corrupt."""
    dd = _path(".apex-design-draft.json")
    if not dd.exists():
        return None
    try:
        return json.loads(dd.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def clear_design_draft() -> None:
    """Delete the Phase 2 design draft file."""
    dd = _path(".apex-design-draft.json")
    if dd.exists():
        dd.unlink()


def write_project_design_bundle(ux_brief: str, endpoints: str, data_model: str) -> None:
    """Overwrite design-bundle.md with the approved project-level design."""
    init_context()
    db = _path("design-bundle.md")
    content = (
        "# Design Bundle\n\n"
        f"**Locked at:** {_now()}\n\n"
        "## UX Brief\n\n"
        f"{ux_brief.strip()}\n\n"
        "## Endpoints\n\n"
        f"{endpoints.strip()}\n\n"
        "## Data Model\n\n"
        f"{data_model.strip()}\n"
    )
    db.write_text(content, encoding="utf-8")


def write_project_technical_spec(story_ids: list[int], spec: str) -> None:
    """Overwrite technical-spec.md with a unified project-level technical spec.

    Writes a '## Project Design' section (detected by rebuild_story_index to mark all
    stories design_locked). Transitions all story_ids to design_locked in the story index.
    """
    init_context()
    ts = _path("technical-spec.md")
    content = (
        "# Technical Specification\n\n"
        "> Per-story technical contracts (OpenAPI / DB schema).\n"
        "> Appended automatically by apex after human approval.\n\n"
        "## Project Design\n\n"
        "### Unified Technical Spec\n\n"
        f"**Locked at:** {_now()}\n\n"
        f"```yaml\n{spec.strip()}\n```\n"
    )
    ts.write_text(content, encoding="utf-8")
    for story_id in story_ids:
        upsert_story_index(story_id, phase_status="design_locked", has_tech_spec=True)


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
    db = _path("design-bundle.md")
    content = (
        db.read_text(encoding="utf-8")
        if db.exists()
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
    db.write_text(content.rstrip() + "\n" + block, encoding="utf-8")


def get_epic_design_bundle(epic_id: int) -> dict | None:
    """Return the saved design bundle for an epic, or None if not yet saved."""
    init_context()
    db = _path("design-bundle.md")
    if not db.exists():
        return None
    content = db.read_text(encoding="utf-8")
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


_CROSS_EPIC_CONTEXT_CHAR_LIMIT = 50_000


def get_other_epics_design_context(exclude_epic_id: int) -> str:
    """Return a prompt-ready block of all saved design bundles except exclude_epic_id.

    Used by the AI to maintain cross-epic consistency — components, wireframe patterns,
    and user flows from already-locked epics are injected as binding constraints.
    Returns empty string when no other epics have saved designs.
    Truncated to _CROSS_EPIC_CONTEXT_CHAR_LIMIT chars to avoid overflowing the LLM context window.
    """
    init_context()
    db = _path("design-bundle.md")
    if not db.exists():
        return ""
    content = db.read_text(encoding="utf-8")

    # Find all epic block boundaries (start positions + ids + titles)
    headers = list(re.finditer(r"\n## Epic (\d+): (.+?)\n", content))
    if not headers:
        return ""

    component_sections: list[str] = []
    wireframe_sections: list[str] = []
    flow_sections:      list[str] = []

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
    result = "\n\n".join(parts)
    if len(result) > _CROSS_EPIC_CONTEXT_CHAR_LIMIT:
        import logging as _log
        _log.getLogger("apex.context_manager").warning(
            "get_other_epics_design_context: truncating cross-epic context "
            "from %d to %d chars for project %s",
            len(result), _CROSS_EPIC_CONTEXT_CHAR_LIMIT, _get_project_id(),
        )
    return result[:_CROSS_EPIC_CONTEXT_CHAR_LIMIT]


def write_tech_stack(tech_stack: str) -> None:
    """Overwrite the tech stack content in tech-stack.md.

    Preserves the '## Architecture Principles' section from the existing file
    (or the default template if the file was freshly created).
    """
    ts = _path("tech-stack.md")
    existing = ts.read_text(encoding="utf-8") if ts.exists() else _TECH_STACK_TEMPLATE

    # Preserve the Architecture Principles section if present
    arch_match = re.search(
        r"^##\s+Architecture\s+Principles.*",
        existing, re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    arch_section = arch_match.group(0).strip() if arch_match else (
        "## Architecture Principles\n\n"
        "<!-- Document the core architectural decisions and constraints for this project. -->"
    )
    content = f"# Tech Stack\n\n{tech_stack.strip()}\n\n{arch_section}\n"
    ts.write_text(content, encoding="utf-8")


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
    ts = _path("technical-spec.md")
    content = ts.read_text(encoding="utf-8")

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
    ts.write_text(content.rstrip() + "\n" + block, encoding="utf-8")

    for story_id in story_ids:
        upsert_story_index(story_id, phase_status="design_locked", has_tech_spec=True)


_TEMPLATES: dict[str, str] = {
    "project-concept.md": _PROJECT_CONCEPT_TEMPLATE,
    "tech-stack.md":      _TECH_STACK_TEMPLATE,
    "functional-spec.md": _FUNCTIONAL_SPEC_TEMPLATE,
    "technical-spec.md":  _TECHNICAL_SPEC_TEMPLATE,
    "vaccines.md":        _VACCINES_TEMPLATE,
    "design-bundle.md":   _DESIGN_BUNDLE_TEMPLATE,
}


def read_context_file(filename: str) -> str:
    """Return the content of a named context file, or '' if missing."""
    init_context()
    p = _path(filename)
    return p.read_text(encoding="utf-8").strip() if p.exists() else ""


def write_context_file(filename: str, content: str) -> None:
    """Overwrite a named context file with new content."""
    init_context()
    _path(filename).write_text(content, encoding="utf-8")


def reset_context_file(filename: str) -> None:
    """Reset a single context file to its blank template."""
    template = _TEMPLATES.get(filename)
    if template is None:
        return
    p = _path(filename)
    if p.exists():
        p.write_text(template, encoding="utf-8")
    reset_cache()


def reset_context() -> None:
    """Reset all context files to their initial templates and clear the story index.

    Intended for test/demo purposes only — all locked Gherkin, technical specs,
    vaccine records, and index entries are permanently erased.
    """
    pid = _get_project_id()
    _context_dir().mkdir(parents=True, exist_ok=True)
    for filename, template in _TEMPLATES.items():
        _path(filename).write_text(template, encoding="utf-8")
    _save_story_index({})
    clear_draft()
    _initialized_projects.discard(pid)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
