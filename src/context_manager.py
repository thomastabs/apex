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
import threading
import time
from datetime import datetime, timezone

from src.storage import StoragePath as Path

_logger = logging.getLogger("apex.context_manager")

_BASE_CONTEXTSPEC = Path("contextspec")
_CONFIG_FILE      = _BASE_CONTEXTSPEC / ".apex-config.json"

# Workspace config cache (audit H4). In Azure mode the config lives on the File
# Share, so an uncached load_config() is a network round-trip — and deps.py /
# the PM proxies hit it on every cache-missed credential check. The backend is
# the single writer (audit C1); _config_write_lock serialises read-modify-write
# so interleaved threads can't lose updates, and every write primes the cache.
# The only staleness window is out-of-band edits, bounded by the short TTL.
_CONFIG_CACHE_TTL = 5.0  # seconds
_config_cache: dict | None = None
_config_cache_expires: float = 0.0
_config_cache_lock = threading.Lock()
_config_write_lock = threading.Lock()

# Per-request active project. Uses ContextVar so concurrent FastAPI requests on different projects are isolated.
_active_project_id: contextvars.ContextVar[int] = contextvars.ContextVar(
    "context_manager_project_id",
    default=int(os.getenv("PM_PROJECT_ID") or os.getenv("TAIGA_PROJECT_ID") or "0"),
)

# Per-request active PM instance. Context files live under
# contextspec/<instance_id>/<project_id>/ so the same project_id on different
# Taiga instances (Cloud vs private) never collides — the instance is the tenant
# boundary that makes multi-user × multi-instance safe. See instance_key().
_active_instance_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "context_manager_instance_id",
    default=os.getenv("APEX_INSTANCE_ID", "").strip() or "default",
)


def _get_project_id() -> int:
    return _active_project_id.get()


def _get_instance_id() -> str:
    return _active_instance_id.get() or "default"


def set_active_instance(instance_id: str) -> None:
    """Set the active PM instance namespace for the current request context."""
    _active_instance_id.set(instance_id or "default")


def instance_key(url: str) -> str:
    """Canonical, filesystem-safe storage namespace for a PM instance URL.

    Derived from the host so distinct instances get distinct namespaces
    (https://api.taiga.io -> 'api_taiga_io', acme.atlassian.net ->
    'acme_atlassian_net'). Public hosts always contain letters, so an instance
    dir never looks like a numeric project dir — keeping migration detection
    unambiguous. Blank/unparseable -> 'default'.
    """
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").strip().lower()
    if not host:
        return "default"
    return re.sub(r"[^a-z0-9]", "_", host)


def _ctx_key(pid: int | None = None) -> tuple[str, int]:
    """Composite per-process cache key: (instance_id, project_id)."""
    return (_get_instance_id(), pid if pid is not None else _get_project_id())


def _context_dir(pid: int | None = None) -> Path:
    p = pid if pid is not None else _get_project_id()
    base = _BASE_CONTEXTSPEC / _get_instance_id()
    return base / str(p) if p else base / "default"


def _path(filename: str, pid: int | None = None) -> Path:
    return _context_dir(pid) / filename


def get_file_path(filename: str, pid: int | None = None) -> Path:
    """Public accessor for the resolved filesystem path of a context file."""
    return _path(filename, pid)


# Process-scoped per-project caches.  Keyed by project_id so concurrent requests
# on different projects never share or overwrite each other's in-memory state.
# Story-index cache entries are (file_mtime_at_load, index); the mtime is
# compared on every read so a write from another worker/process invalidates
# this one's cache. _index_lock serializes read-modify-write cycles — phase
# endpoints are sync `def`s running on a threadpool, so unlocked upserts can
# interleave and lose updates.
_index_lock = threading.RLock()
_story_index_caches:  dict[tuple[str, int], tuple[float, dict]] = {}
_initialized_projects: set[tuple[str, int]]              = set()




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
        "CONSTRAINTS_FILE":     "constraints.md",
        "VACCINES_FILE":        "vaccines.md",
        "AMENDMENTS_FILE":      "amendments.md",
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
        return _ctx_key() in _initialized_projects
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

_CONSTRAINTS_TEMPLATE = """\
# Non-Functional Requirements

> Project-wide quality constraints in EARS notation (performance, security, reliability, …).
> Behavioural requirements live in the Gherkin acceptance criteria, not here.
> Generated in Phase 1 and editable; injected into developer packs and test plans.

"""

_AMENDMENTS_TEMPLATE = """\
# Spec Amendments

> Log of edits made to a locked spec artifact after a story passed its phase gate.
> Each amendment flags the affected downstream stories for re-derivation (spec drift),
> so post-lock changes co-evolve through the chain instead of silently diverging.

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

_GITHUB_CONTEXT_TEMPLATE = """\
# GitHub Repository Context

<!-- Populated automatically by the GitHub Sync button in the sidebar. -->
<!-- Contains: repo metadata, file tree, README, and key config files. -->
<!-- Injected into Phase 2 and Phase 3 AI prompts as codebase context. -->
"""

# Phase status values — ordered by SDLC progression.
PHASE_STATUSES = (
    "gherkin_locked",  # Phase 1 complete: Gherkin approved and locked
    "design_locked",   # Phase 2 complete: Technical Spec generated and locked
    "implementation",  # Phase 3: Coding proposals / tasks generated
    "qa",              # Phase 4: BDD test plan generated
    "qa_passed",       # Phase 4 complete: Testing Gate passed, awaiting deployment
    "deployed",        # Phase 5: Deployed to production
)


# ---------------------------------------------------------------------------
# Project switching
# ---------------------------------------------------------------------------

def set_active_project(project_id: int) -> None:
    """Switch the active project for the current request context.

    Sets the ContextVar so all subsequent file operations in this request use
    contextspec/<project_id>/.  Each project has its own subdirectory so context
    files never bleed across projects.

    Deliberately does NOT persist to config: this runs on every request, and a
    config write here means concurrent users on different projects thrash the
    shared config file. The frontend persists the selection explicitly via
    POST /workspace/config when the user picks a project.
    """
    _active_project_id.set(project_id)


def is_project_selected() -> bool:
    """Return True when a real PM project is active."""
    return _get_project_id() != 0


def _read_config_file() -> dict:
    """Read and parse the config file directly, bypassing the cache. {} if missing/corrupt."""
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


def _prime_config_cache(data: dict) -> None:
    global _config_cache, _config_cache_expires
    with _config_cache_lock:
        _config_cache = dict(data)
        _config_cache_expires = time.monotonic() + _CONFIG_CACHE_TTL


def _invalidate_config_cache() -> None:
    global _config_cache, _config_cache_expires
    with _config_cache_lock:
        _config_cache = None
        _config_cache_expires = 0.0


def _update_config(mutate, *, log_label: str) -> None:
    """Serialised read-modify-write of the shared config file.

    The write lock makes the read-modify-write atomic across interleaved
    threadpool requests (config writes had no lock — audit C1/H4), and the
    fresh read avoids acting on a stale cache. On success the cache is primed
    with the written data so the next load_config() is warm.
    """
    try:
        with _config_write_lock:
            _BASE_CONTEXTSPEC.mkdir(parents=True, exist_ok=True)
            data = _read_config_file()
            mutate(data)
            _CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
            _prime_config_cache(data)
    except OSError as exc:
        _logger.warning("%s: failed to persist config: %s", log_label, exc)


def save_ai_config(model: str) -> None:
    """Persist AI model preference to the shared config file."""
    _update_config(lambda data: data.__setitem__("ai_model", model), log_label="save_ai_config")


def save_config(project_id: int) -> None:
    """Persist the active project ID to the file share root so it survives container restarts."""
    def _mutate(data: dict) -> None:
        data["project_id"] = project_id
        data.pop("auth_token", None)  # never persist auth tokens
    _update_config(_mutate, log_label="save_config")


def save_pm_config(
    pm_tool: str | None = None,
    jira_base_url: str | None = None,
    taiga_url: str | None = None,
) -> None:
    """Persist PM tool selection and PM base URLs to the shared config file."""
    def _mutate(data: dict) -> None:
        if pm_tool is not None:
            data["pm_tool"] = pm_tool
        if jira_base_url is not None:
            data["jira_base_url"] = jira_base_url
        if taiga_url is not None:
            data["taiga_url"] = taiga_url
    _update_config(_mutate, log_label="save_pm_config")


# ── Per-instance config (github_repo) ─────────────────────────────────────────
# github_repo is scoped to the active PM instance so Cloud and private-instance
# users don't share one repo. Lives at contextspec/<instance_id>/.instance-config.json
# (a file alongside the project dirs; migration only moves numeric project dirs).
_INSTANCE_CONFIG_FILE = ".instance-config.json"


def _instance_dir() -> Path:
    return _BASE_CONTEXTSPEC / _get_instance_id()


def get_instance_github_repo() -> str:
    """GitHub repo for the active instance, falling back to legacy global config."""
    p = _instance_dir() / _INSTANCE_CONFIG_FILE
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            repo = data.get("github_repo")
            if isinstance(repo, str):
                return repo
        except (json.JSONDecodeError, OSError):
            pass
    return load_config().get("github_repo", "") or ""  # migration fallback


def save_instance_github_repo(repo: str | None) -> None:
    """Persist GitHub repo (owner/repo) for the active instance namespace."""
    if repo is None:
        return
    inst = _instance_dir()
    inst.mkdir(parents=True, exist_ok=True)
    p = inst / _INSTANCE_CONFIG_FILE
    data: dict = {}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    data["github_repo"] = repo or ""
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_config() -> dict:
    """Return the persisted config dict (a copy), or {} if missing/corrupt.

    Cached for _CONFIG_CACHE_TTL seconds — see the cache note at module top.
    Always returns a fresh copy so callers can mutate without corrupting the cache.
    """
    global _config_cache, _config_cache_expires
    now = time.monotonic()
    with _config_cache_lock:
        if _config_cache is not None and now < _config_cache_expires:
            return dict(_config_cache)
    cfg = _read_config_file()
    with _config_cache_lock:
        _config_cache = dict(cfg)
        _config_cache_expires = time.monotonic() + _CONFIG_CACHE_TTL
    return dict(cfg)


def reset_cache() -> None:
    """Reset in-memory caches for the current project without changing active paths.

    Useful when the underlying files may have changed externally (e.g. in tests or
    after a story index rebuild via the API).
    """
    key = _ctx_key()
    _initialized_projects.discard(key)
    _story_index_caches.pop(key, None)
    _invalidate_config_cache()


def migrate_to_instance_scoped(instance_id: str) -> int:
    """Relocate legacy contextspec/<project_id>/ dirs under contextspec/<instance_id>/.

    Context storage is now namespaced by PM instance (contextspec/<instance>/<pid>/).
    This moves pre-namespacing data — project dirs that sit directly at the
    contextspec root — into the given instance namespace. Idempotent: only
    top-level entries whose name is purely numeric (legacy project dirs) are
    moved; already-namespaced instance dirs and the root .apex-config.json are
    left untouched. Project dirs are flat (no nested subdirs), so a single-level
    file copy suffices. Works in local and Azure File Share modes via StoragePath.
    Returns the number of project dirs migrated.
    """
    instance_id = (instance_id or "").strip() or "default"
    moved = 0
    # Materialise before iterating — the loop creates a new top-level instance dir.
    for entry in list(_BASE_CONTEXTSPEC.iterdir_dirs()):
        name = entry.name
        if not name.isdigit():
            continue  # already an instance namespace dir — skip
        dest_dir = _BASE_CONTEXTSPEC / instance_id / name
        dest_dir.mkdir(parents=True, exist_ok=True)
        for f in entry.iterdir():
            if f.is_dir():
                _logger.warning("migrate: unexpected subdir %s — leaving in place", f)
                continue
            (dest_dir / f.name).write_text(f.read_text(), encoding="utf-8")
            f.unlink(missing_ok=True)
        entry.rmdir()  # remove the now-empty legacy dir
        moved += 1
        _logger.info("migrate: contextspec/%s -> contextspec/%s/%s", name, instance_id, name)
    if moved:
        _story_index_caches.clear()
        _initialized_projects.clear()
    return moved


# ---------------------------------------------------------------------------
# Initialisation & migrations
# ---------------------------------------------------------------------------

def init_context() -> None:
    """Create spec files with standard templates if they do not exist, then run migrations."""
    pid = _get_project_id()
    key = _ctx_key(pid)
    if key in _initialized_projects:
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
        ("constraints.md",     _CONSTRAINTS_TEMPLATE),
        ("vaccines.md",        _VACCINES_TEMPLATE),
        ("amendments.md",      _AMENDMENTS_TEMPLATE),
        ("design-bundle.md",   _DESIGN_BUNDLE_TEMPLATE),
    ]:
        p = _path(filename)
        if not p.exists():
            p.write_text(template, encoding="utf-8")
    _migrate_vaccine_records()
    if not _path("story-index.json").exists():
        rebuild_story_index()
    _initialized_projects.add(key)


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

def _index_file_mtime(sif) -> float:
    """Return the index file's mtime, or -1.0 when absent/unreadable."""
    try:
        return sif.stat().st_mtime if sif.exists() else -1.0
    except OSError:
        return -1.0


def get_story_index() -> dict[str, dict]:
    """Return the story index as {str(story_id): entry_dict}.

    Cached per project, invalidated when the file's mtime changes. The backend
    is the single writer (audit C1) and updates this cache on every write, so
    the mtime check exists to pick up out-of-band changes — tests, manual edits,
    or an index rebuild via the API — not concurrent writers.
    """
    key = _ctx_key()
    with _index_lock:
        sif = _path("story-index.json")
        mtime = _index_file_mtime(sif)
        cached = _story_index_caches.get(key)
        if cached is not None and cached[0] == mtime:
            return cached[1]
        index = json.loads(sif.read_text(encoding="utf-8")) if mtime >= 0 else {}
        _story_index_caches[key] = (mtime, index)
        return index


def _save_story_index(index: dict[str, dict]) -> None:
    key = _ctx_key()
    with _index_lock:
        sif = _path("story-index.json")
        sif.write_text(
            json.dumps(index, indent=2, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )
        _story_index_caches[key] = (_index_file_mtime(sif), index)


def _now_iso() -> str:
    """Machine-readable UTC timestamp for status_history and JSON artifacts.

    Distinct from _now(), whose human format is baked into existing markdown
    headers (vaccines, locked-at lines) — never swap one for the other.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def upsert_story_index(story_id: int, **updates) -> None:
    """Create or update the index entry for a story.

    Only the fields passed as keyword arguments are modified; all other fields
    retain their current values.  Missing entries are created with defaults.

    Valid fields: epic_id, title, phase_status, has_gherkin, has_tech_spec,
                  has_proposal, has_bdd, has_bug_report, has_infra_delta,
                  has_deploy_pack, deploy_bypass, fix_bolt_count,
                  spec_drift, drift_reason.

    Whenever phase_status changes (including the initial status of a new
    entry) a UTC timestamp is appended to entry["status_history"][status] —
    a list, so Fix-Bolt re-entries into the same status are preserved.
    """
    if "phase_status" in updates and updates["phase_status"] not in PHASE_STATUSES:
        raise ValueError(
            f"Invalid phase_status {updates['phase_status']!r}. Must be one of {PHASE_STATUSES}."
        )
    with _index_lock:
        index = get_story_index()
        key   = str(story_id)
        # Compare against what existed before this call: the defaults dict seeds
        # phase_status from `updates`, so comparing against `entry` afterwards
        # would never record a new entry's first status.
        prev_status = index.get(key, {}).get("phase_status")
        entry = index.get(key, {
            "story_id":    story_id,
            "epic_id":     None,
            "title":       "",
            "phase_status": updates.get("phase_status", "gherkin_locked"),
            "has_gherkin":     False,
            "has_tech_spec":   False,
            "has_proposal":    False,
            "has_bdd":         False,
            "has_bug_report":  False,
            "has_infra_delta": False,
            "has_deploy_pack": False,
            "deploy_bypass":   False,
            "fix_bolt_count":  0,
            "spec_drift":      False,
            "drift_reason":    "",
            "status_history":  {},
        })
        entry.update(updates)
        entry["story_id"] = story_id  # ensure the canonical field is always correct
        new_status = entry.get("phase_status")
        if new_status and new_status != prev_status:
            entry.setdefault("status_history", {}).setdefault(new_status, []).append(_now_iso())
        index[key] = entry
        _save_story_index(index)


def increment_story_counter(story_id: int, field: str = "fix_bolt_count") -> int:
    """Atomically increment a numeric counter on a story-index entry.

    Read-modify-write must happen under _index_lock — services must never
    compute counter values themselves and pass them to upsert_story_index.
    Returns the new value. No-op (returns 0) if the entry doesn't exist.
    """
    with _index_lock:
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is None:
            return 0
        entry[field] = int(entry.get(field, 0)) + 1
        _save_story_index(index)
        return entry[field]


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
    with _index_lock:
        index = get_story_index()
        for entry in index.values():
            entry["has_tech_spec"]  = False
            entry["has_proposal"]   = False
            entry["has_bdd"]        = False
            entry["has_bug_report"] = False
            entry["has_infra_delta"] = False
            entry["has_deploy_pack"] = False
            entry["deploy_bypass"]   = False
            entry["fix_bolt_count"]  = 0
            entry["status_history"]  = {}
            if entry.get("phase_status") not in ("gherkin_locked",):
                entry["phase_status"] = "gherkin_locked"
        _save_story_index(index)
    reset_cache()


def remove_story_index_entries(story_ids: list[int]) -> None:
    """Remove entries for the given story IDs from the story index and spec files."""
    if not story_ids:
        return
    with _index_lock:
        index = get_story_index()
        for sid in story_ids:
            index.pop(str(sid), None)
        _save_story_index(index)
    for story_id in story_ids:
        remove_story_from_specs(story_id)


def remove_epic_from_story_index(epic_id: int) -> None:
    """Remove all story index entries for epic_id, the epic sections from both
    spec files, and all associated proposal and BDD files."""
    with _index_lock:
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

    Safe to call at any time — replaces the existing index entirely, except
    that fields a rebuild cannot derive from files (status_history,
    fix_bolt_count, and the qa_passed/deployed statuses) are carried over
    from the previous index for stories that still exist.
    """
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    try:
        old_index = get_story_index()
    except Exception:
        old_index = {}
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
                    "has_gherkin":    True,
                    "has_tech_spec":  False,
                    "has_proposal":   False,
                    "has_bdd":        False,
                    "has_bug_report": False,
                }
                continue

            flat_m = re.match(r"^## Story (\d+): (.+)$", line)
            if flat_m:
                sid = str(int(flat_m.group(1)))
                if sid not in index:  # don't overwrite a nested entry
                    index[sid] = {
                        "story_id":      int(sid),
                        "epic_id":       None,
                        "title":         flat_m.group(2).strip(),
                        "phase_status":  "gherkin_locked",
                        "has_gherkin":    True,
                        "has_tech_spec":  False,
                        "has_proposal":   False,
                        "has_bdd":        False,
                        "has_bug_report": False,
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

    # ── Cross-reference bug_report_*.md files ────────────────────────────────
    for p in cd.iterdir():
        if p.name.startswith("bug_report_") and p.suffix == ".md":
            try:
                sid = str(int(p.stem.removeprefix("bug_report_")))
                if sid in index:
                    index[sid]["has_bug_report"] = True
            except ValueError:
                pass

    # ── Cross-reference Phase 5 artifacts ─────────────────────────────────────
    for p in cd.iterdir():
        if p.name.startswith("infra_delta_story_") and p.suffix == ".json":
            try:
                sid = str(int(p.stem.removeprefix("infra_delta_story_")))
                if sid in index:
                    index[sid]["has_infra_delta"] = True
                    delta = json.loads(p.read_text(encoding="utf-8"))
                    index[sid]["deploy_bypass"] = not delta.get("needs_infra_change", True)
            except (ValueError, json.JSONDecodeError):
                pass
        elif p.name.startswith("deploy_pack_story_") and p.suffix == ".md":
            try:
                sid = str(int(p.stem.removeprefix("deploy_pack_story_")))
                if sid in index:
                    index[sid]["has_deploy_pack"] = True
            except ValueError:
                pass

    # ── Carry over what files can't tell us ───────────────────────────────────
    # A rebuild can only infer statuses up to "qa" (from bdd files); qa_passed
    # and deployed are gate decisions recorded solely in the index, and
    # status_history / fix_bolt_count have no file counterpart at all.
    for sid, entry in index.items():
        old = old_index.get(sid)
        if not old:
            continue
        if old.get("status_history"):
            entry["status_history"] = old["status_history"]
        if old.get("fix_bolt_count"):
            entry["fix_bolt_count"] = old["fix_bolt_count"]
        if old.get("phase_status") in ("qa_passed", "deployed") and entry["phase_status"] == "qa":
            entry["phase_status"] = old["phase_status"]

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
    # Regenerating a dev pack means the story was re-derived from the current
    # spec — any post-lock drift has been addressed, so clear the flag.
    clear_spec_drift(story_id)
    return p


def proposal_exists(story_id: int, task_id: int) -> bool:
    """Return True if a saved proposal file exists for this story/task pair."""
    return (_context_dir() / f"proposal_story_{story_id}_task_{task_id}.md").exists()


def load_proposals(story_id: int) -> list[dict]:
    """Return all saved proposals for a story as [{"task_id": int, "proposal_md": str}]."""
    cd = _context_dir()
    prefix = f"proposal_story_{story_id}_task_"
    results = []
    for p in sorted(p for p in cd.iterdir() if p.name.startswith(prefix) and p.name.endswith(".md")):
        stem = p.stem  # proposal_story_N_task_M
        try:
            task_id = int(stem[len(prefix):])
        except ValueError:
            continue
        try:
            results.append({"task_id": task_id, "proposal_md": p.read_text(encoding="utf-8")})
        except OSError:
            continue
    return results


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


def save_screen_flow(diagram: dict) -> None:
    """Persist the screen flow React Flow JSON for the current project."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    _path("diagram-screens.json").write_text(
        json.dumps(diagram, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def load_screen_flow() -> dict | None:
    """Return the screen flow JSON, or None if not yet generated."""
    p = _path("diagram-screens.json")
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_bdd_tests(story_id: int, test_script: str) -> Path:
    """Save BDD test plan to contextspec/bdd_story_<id>.feature and return the path."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"bdd_story_{story_id}.feature"
    p.write_text(test_script, encoding="utf-8")
    upsert_story_index(story_id, has_bdd=True, phase_status="qa")
    return p


def delete_bdd_tests(story_id: int) -> None:
    """Remove a story's test plan and roll its phase state back to implementation.

    QA results are deliberately kept — they are execution history, not plan state.
    """
    (_context_dir() / f"bdd_story_{story_id}.feature").unlink(missing_ok=True)
    with _index_lock:
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is None:
            return
        entry["has_bdd"] = False
        if entry.get("phase_status") == "qa":
            entry["phase_status"] = "implementation"
            entry.setdefault("status_history", {}).setdefault("implementation", []).append(_now_iso())
        _save_story_index(index)


def list_all_proposals() -> list[dict]:
    """Every developer pack in the project: [{story_id, task_id, chars}]."""
    cd = _context_dir()
    out: list[dict] = []
    if not cd.exists():
        return out
    for p in cd.iterdir():
        if p.name.startswith("proposal_story_") and p.suffix == ".md":
            try:
                parts = p.stem.split("_")
                sid = int(parts[parts.index("story") + 1])
                tid = int(parts[parts.index("task") + 1])
                out.append({"story_id": sid, "task_id": tid,
                            "chars": len(p.read_text(encoding="utf-8"))})
            except (ValueError, IndexError, OSError):
                pass
    return sorted(out, key=lambda x: (x["story_id"], x["task_id"]))


def delete_proposal(story_id: int, task_id: int) -> None:
    """Remove one task's developer pack; clear has_proposal when none remain.

    Called when the task itself is deleted in the PM tool — an orphaned pack
    would keep the story counting as "proposed" forever.
    """
    cd = _context_dir()
    (cd / f"proposal_story_{story_id}_task_{task_id}.md").unlink(missing_ok=True)
    remaining = cd.exists() and any(
        p.name.startswith(f"proposal_story_{story_id}_") for p in cd.iterdir()
    )
    if remaining:
        return
    with _index_lock:
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is None:
            return
        entry["has_proposal"] = False
        if entry.get("phase_status") == "implementation":
            entry["phase_status"] = "design_locked" if entry.get("has_tech_spec") else "gherkin_locked"
            entry.setdefault("status_history", {}).setdefault(entry["phase_status"], []).append(_now_iso())
        _save_story_index(index)


def load_bdd_tests(story_id: int) -> str:
    """Load the BDD test plan for a story, empty string if not found."""
    p = _context_dir() / f"bdd_story_{story_id}.feature"
    if not p.exists():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return ""


def save_qa_results(story_id: int, gate: str, results: list[dict]) -> Path:
    """Append a QA execution attempt to contextspec/qa_results_story_<id>.json.

    Attempts accumulate rather than overwrite so a fail-then-pass history
    survives for the traceability matrix and analytics.
    """
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"qa_results_story_{story_id}.json"
    data: dict = {"story_id": story_id, "attempts": []}
    if p.exists():
        try:
            existing = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(existing.get("attempts"), list):
                data = existing
        except (json.JSONDecodeError, OSError):
            pass
    data["attempts"].append({
        "recorded_at": _now_iso(),
        "gate": gate,
        "results": results,
    })
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return p


def load_qa_results(story_id: int) -> dict | None:
    """Load the QA results envelope for a story, None if absent/unreadable."""
    p = _context_dir() / f"qa_results_story_{story_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def render_infra_delta_md(story_id: int, delta: dict) -> str:
    """Human-readable rendering of an infra delta verdict (the JSON stays canonical)."""
    verdict = "CHANGES REQUIRED" if delta.get("needs_infra_change") else "ROUTINE DEPLOYMENT (bypass)"
    lines = [
        f"# Infrastructure Delta — Story {story_id}",
        "",
        f"**Verdict:** {verdict}",
        "",
        f"**Rationale:** {delta.get('rationale', '').strip()}",
        "",
    ]
    for item in delta.get("deltas", []):
        lines += [
            f"## {item.get('title', '').strip()}",
            "",
            f"**Category:** {item.get('category', '')} · **Risk:** {item.get('risk', '')}",
            "",
            item.get("detail", "").strip(),
            "",
        ]
    return "\n".join(lines)


def save_infra_delta(story_id: int, delta: dict) -> Path:
    """Persist the Phase 5 infra delta verdict (JSON canonical + rendered markdown)."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"infra_delta_story_{story_id}.json"
    p.write_text(json.dumps(delta, indent=2, ensure_ascii=False), encoding="utf-8")
    (cd / f"infra_delta_story_{story_id}.md").write_text(
        render_infra_delta_md(story_id, delta), encoding="utf-8",
    )
    upsert_story_index(
        story_id,
        has_infra_delta=True,
        deploy_bypass=not delta.get("needs_infra_change", True),
    )
    return p


def load_infra_delta(story_id: int) -> dict | None:
    """Load the infra delta verdict for a story, None if absent/unreadable."""
    p = _context_dir() / f"infra_delta_story_{story_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_deploy_pack(story_id: int, pack_md: str) -> Path:
    """Persist the Phase 5 deploy pack to contextspec/deploy_pack_story_<id>.md."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"deploy_pack_story_{story_id}.md"
    p.write_text(pack_md, encoding="utf-8")
    upsert_story_index(story_id, has_deploy_pack=True)
    return p


def load_deploy_pack(story_id: int) -> str:
    """Load the deploy pack for a story, empty string if not found."""
    p = _context_dir() / f"deploy_pack_story_{story_id}.md"
    if not p.exists():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return ""


def append_deployment_record(
    story_id: int,
    title: str,
    *,
    bypass: bool,
    pack_present: bool,
    sign_offs: list[str],
    notes: str = "",
) -> None:
    """Append a Deployment Gate decision to deployment-log.md (created on demand).

    The entry heading embeds the story id and an ISO timestamp so the log stays
    machine-parseable for rebuilds and analytics.
    """
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / "deployment-log.md"
    existing = p.read_text(encoding="utf-8") if p.exists() else (
        "# Deployment Log\n\nGate decisions recorded by Phase 5 — one entry per deployment.\n"
    )
    entry = [
        "",
        f"## Deployment — Story {story_id} — {_now_iso()}",
        "",
        f"- **Story:** {title.strip() or f'Story {story_id}'}",
        f"- **Route:** {'Routine (bypass — no infra changes)' if bypass else 'Deploy pack applied'}",
        f"- **Deploy pack:** {'present' if pack_present else 'n/a'}",
        f"- **Sign-offs:** {', '.join(sign_offs)}",
    ]
    if notes.strip():
        entry.append(f"- **Notes:** {notes.strip()}")
    entry.append("")
    # Append via read+write — StoragePath (the production base type, local or
    # Azure) has no append-mode open().
    p.write_text(existing + "\n".join(entry), encoding="utf-8")


def _render_verification_md(story_id: int, data: dict) -> str:
    """Human-readable traceability matrix (the JSON stays canonical)."""
    summary = data.get("summary", {})
    lines = [
        f"# Traceability Matrix — Story {story_id}",
        "",
        f"Generated: {data.get('generated_at', '')} · "
        f"Scenarios: {summary.get('total', 0)} · Covered: {summary.get('covered', 0)} · "
        f"With pack: {summary.get('with_pack', 0)} · Tested: {summary.get('tested', 0)} · "
        f"Gaps: {summary.get('gap_count', 0)}",
        "",
        "| Scenario | Covering tasks | Tasks with pack | QA result | Gaps |",
        "|---|---|---|---|---|",
    ]
    for row in data.get("scenarios", []):
        tasks = ", ".join(str(t) for t in row.get("tasks", [])) or "—"
        packs = ", ".join(str(t) for t in row.get("tasks_with_pack", [])) or "—"
        gaps = ", ".join(row.get("gaps", [])) or "—"
        lines.append(
            f"| {row.get('scenario', '')} | {tasks} | {packs} | {row.get('qa_result', 'untested')} | {gaps} |"
        )
    lines.append("")
    return "\n".join(lines)


def save_verification(story_id: int, data: dict) -> Path:
    """Persist the Phase 5 traceability matrix (JSON canonical + rendered markdown)."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    data = {**data, "story_id": story_id, "generated_at": data.get("generated_at") or _now_iso()}
    p = cd / f"verification_story_{story_id}.json"
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    (cd / f"verification_story_{story_id}.md").write_text(
        _render_verification_md(story_id, data), encoding="utf-8",
    )
    return p


def load_verification(story_id: int) -> dict | None:
    """Load the traceability matrix for a story, None if absent/unreadable."""
    p = _context_dir() / f"verification_story_{story_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_conformance(story_id: int, data: dict) -> Path:
    """Persist the Phase 6 spec↔code conformance report (JSON canonical)."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    data = {**data, "story_id": story_id, "generated_at": data.get("generated_at") or _now_iso()}
    p = cd / f"conformance_story_{story_id}.json"
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return p


def load_conformance(story_id: int) -> dict | None:
    """Load the conformance report for a story, None if absent/unreadable."""
    p = _context_dir() / f"conformance_story_{story_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_bug_report(story_id: int, bug_md: str) -> Path:
    """Persist the Fix-Bolt artifact for a story to contextspec/bug_report_<id>.md."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    p = cd / f"bug_report_{story_id}.md"
    p.write_text(bug_md, encoding="utf-8")
    upsert_story_index(story_id, has_bug_report=True)
    return p


def load_bug_report(story_id: int) -> str:
    """Load the Fix-Bolt artifact for a story, empty string if not found."""
    p = _context_dir() / f"bug_report_{story_id}.md"
    if not p.exists():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return ""


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


def get_story_design_bundle(story_id: int) -> str:
    """Design-bundle slice relevant to a story: just its epic's `## Epic {id}`
    block when the per-epic format is in use, else the whole file.

    Keeps per-task prompts (generate_tasks / generate_proposal) from growing
    unbounded as unrelated epics are added — only the story's own epic design is
    injected. Falls back to the full bundle for the unified single-block format
    (write_project_design_bundle) or when the epic block isn't found, so there is
    no regression for existing single-epic projects.
    """
    init_context()
    db = _path("design-bundle.md")
    if not db.exists():
        return ""
    content = db.read_text(encoding="utf-8")
    entry = get_story_index().get(str(story_id)) or {}
    epic_id = entry.get("epic_id")
    if epic_id is not None:
        m = re.search(rf"\n## Epic {epic_id}:.*?(?=\n## |\Z)", content, flags=re.DOTALL)
        if m:
            return m.group(0).strip()
    return content


# ---------------------------------------------------------------------------
# Controlled spec co-evolution — post-lock amendments + drift flag (roadmap #4)
# ---------------------------------------------------------------------------

# Each spec artifact locks at a phase; a story is "affected" by an edit to that
# file once its phase_status is at or after the lock. Append/sync artifacts
# (vaccines.md, github-context.md) are not spec locks and never trigger drift.
_SPEC_LOCK_PHASE: dict[str, str] = {
    "project-concept.md": "gherkin_locked",
    "functional-spec.md": "gherkin_locked",
    "tech-stack.md":      "design_locked",
    "technical-spec.md":  "design_locked",
    "design-bundle.md":   "design_locked",
    "constraints.md":     "design_locked",
}


def _phase_at_or_after(status: str, lock: str) -> bool:
    """True when `status` is at or beyond `lock` in PHASE_STATUSES order."""
    try:
        return PHASE_STATUSES.index(status) >= PHASE_STATUSES.index(lock)
    except ValueError:
        return False


def affected_stories_for_spec(filename: str) -> list[int]:
    """Story ids past the lock phase for a spec file (empty if not a spec file)."""
    lock = _SPEC_LOCK_PHASE.get(filename)
    if lock is None:
        return []
    out = [
        e["story_id"]
        for e in get_story_index().values()
        if e.get("story_id") is not None and _phase_at_or_after(e.get("phase_status", ""), lock)
    ]
    return sorted(out)


def record_amendment(filename: str, note: str, story_ids: list[int]) -> None:
    """Append a dated amendment entry to amendments.md and flag the affected
    stories with spec_drift so downstream artifacts get re-derived."""
    init_context()
    am = _path("amendments.md")
    header = am.read_text(encoding="utf-8") if am.exists() else _AMENDMENTS_TEMPLATE
    ids = ", ".join(f"#{s}" for s in story_ids) or "(none)"
    block = (
        f"\n## {_now_iso()} — {filename}\n\n"
        f"- **Affected stories:** {ids}\n"
        f"- **Note:** {note.strip() or '(none)'}\n"
    )
    am.write_text(header.rstrip() + "\n" + block, encoding="utf-8")
    with _index_lock:
        index = get_story_index()
        for sid in story_ids:
            entry = index.get(str(sid))
            if entry is not None:
                entry["spec_drift"] = True
                entry["drift_reason"] = filename
        _save_story_index(index)


def amend_locked_spec(filename: str, note: str = "") -> dict:
    """Record a post-lock edit to a spec file. Returns the drift outcome.

    `amended` is False (no log, no drift) when the file is not a lockable spec
    artifact or no story has passed its lock yet (a normal pre-lock edit)."""
    story_ids = affected_stories_for_spec(filename)
    if not story_ids:
        return {"amended": False, "filename": filename, "affected_story_ids": [], "note": note}
    record_amendment(filename, note, story_ids)
    return {"amended": True, "filename": filename, "affected_story_ids": story_ids, "note": note}


def clear_spec_drift(story_id: int) -> None:
    """Clear the drift flag once a story has been re-derived from the new spec."""
    with _index_lock:
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None and entry.get("spec_drift"):
            entry["spec_drift"] = False
            entry["drift_reason"] = ""
            _save_story_index(index)


def get_amendments() -> str:
    """Read the amendments.md log (empty string if absent)."""
    init_context()
    am = _path("amendments.md")
    return am.read_text(encoding="utf-8") if am.exists() else ""


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
    "github-context.md":  _GITHUB_CONTEXT_TEMPLATE,
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
    _context_dir().mkdir(parents=True, exist_ok=True)
    for filename, template in _TEMPLATES.items():
        _path(filename).write_text(template, encoding="utf-8")
    _save_story_index({})
    clear_draft()
    _initialized_projects.discard(_ctx_key())


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
