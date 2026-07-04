"""
context_manager.py
Manages read/write operations on the contextspec/ artefacts:

  project-concept.md   — project purpose, target users, core value proposition (editable)
  tech-stack.md        — technology choices and architecture principles (Tech Lead only)
  functional-spec.md   — per-story Acceptance Criteria (locked on push)
  technical-spec.md    — per-story technical contracts (OpenAPI / DB schema)
  fix-log.md           — permanent fix-log entries for diagnosed bugs (Fix-Apex output only)
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

from src import distributed
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


def _config_write_lock():
    """Serialise config read-modify-write. Process-local lock by default; a
    cross-replica distributed lock when REDIS_URL is set (src/distributed)."""
    return distributed.reentrant_lock("apex:config-write")


def _usage_lock():
    """Serialise AI usage-log read-modify-write, same pattern as _config_write_lock."""
    return distributed.reentrant_lock("apex:usage-write")

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
def _index_lock():
    """Serialise story-index read-modify-write. Process-local **reentrant** lock
    by default; a reentrant cross-replica distributed lock when REDIS_URL is set
    (src/distributed). Reentrant because holders call other index functions."""
    return distributed.reentrant_lock("apex:story-index")


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
        "FIX_LOG_FILE":         "fix-log.md",
        "AMENDMENTS_FILE":      "amendments.md",
        "MAINTENANCE_LOG_FILE": "maintenance-log.md",
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
# Constraints

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

_MAINTENANCE_LOG_TEMPLATE = """\
# Maintenance Log

> Phase 6 post-deployment feedback triage. Each entry records a maintenance item's
> classification (Change Request vs Bug), routing, and resolution — the governed
> Maintenance & Evolution loop. Machine state lives in maintenance_items.json.

"""

_FIX_LOG_TEMPLATE = """\
# Fix Log

> Permanent log of diagnosed bugs. Prevents the AI from hallucinating the same error twice.
> Appended automatically by apex after a Fix-Apex is resolved.

"""

_DECISIONS_TEMPLATE = """\
# Decision Log

> Record of design decisions: rejected AI proposals and notable human changes.
> Captured when a regeneration is discarded or a deploy pack is revised, and may
> be edited by hand. Used as negative constraints downstream so the AI stops
> re-proposing approaches the team already rejected.

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

_FIGMA_CONTEXT_TEMPLATE = """\
# Figma Design Context

<!-- Populated automatically by the Figma Sync button in the sidebar. -->
<!-- Contains: file name, pages, top-level frame names, prototype flows, comments. -->
<!-- Injected into Phase 1 story generation and Phase 2 design as design context. -->
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


def get_active_instance_id() -> str:
    """Public read of the active PM-instance namespace (see instance_key())."""
    return _get_instance_id()


def get_active_project_id() -> int | None:
    """Public read of the active project ID, or None when no project is selected."""
    return _get_project_id() if is_project_selected() else None


# ---------------------------------------------------------------------------
# AI usage log — token/cost telemetry for the Usage dashboard (backend/app/
# services/usage_service.py). One JSONL file per instance per UTC day at
# contextspec/<instance_id>/usage/<yyyy-mm-dd>.jsonl. Read-modify-write under
# _usage_lock() like the config file — daily files keep each read/write small.
# ---------------------------------------------------------------------------

def _usage_file(instance_id: str, day: str) -> Path:
    return _BASE_CONTEXTSPEC / instance_id / "usage" / f"{day}.jsonl"


def append_usage_event(event: dict) -> None:
    """Append one usage event (see ai_engine.set_usage_sink for the shape)."""
    instance_id = _get_instance_id()
    day = datetime.now(timezone.utc).date().isoformat()
    entry = {"ts": datetime.now(timezone.utc).isoformat(), **event}
    path = _usage_file(instance_id, day)
    with _usage_lock():
        existing = path.read_text() if path.exists() else ""
        path.write_text(existing + json.dumps(entry) + "\n")


def load_usage_events(days: int = 30) -> list[dict]:
    """Load usage events for the active instance from the last *days* UTC days."""
    from datetime import timedelta

    instance_id = _get_instance_id()
    today = datetime.now(timezone.utc).date()
    events: list[dict] = []
    for offset in range(days):
        day = (today - timedelta(days=offset)).isoformat()
        path = _usage_file(instance_id, day)
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


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
        with _config_write_lock():
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


def get_or_create_instance_github_webhook_secret() -> str:
    """Webhook secret for the active instance (GitHub push -> auto regression
    scan). Generated once on first read and persisted — the same secret is
    shown to the user (to paste into GitHub's webhook config) and used to
    verify the X-Hub-Signature-256 header on incoming webhook deliveries."""
    inst = _instance_dir()
    p = inst / _INSTANCE_CONFIG_FILE
    data: dict = {}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    secret = data.get("github_webhook_secret")
    if isinstance(secret, str) and secret:
        return secret
    import secrets as _secrets
    secret = _secrets.token_urlsafe(32)
    inst.mkdir(parents=True, exist_ok=True)
    data["github_webhook_secret"] = secret
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return secret


def get_instance_figma_file_key() -> str:
    """Figma file key for the active instance (the linked Figma design file)."""
    p = _instance_dir() / _INSTANCE_CONFIG_FILE
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            key = data.get("figma_file_key")
            if isinstance(key, str):
                return key
        except (json.JSONDecodeError, OSError):
            pass
    return ""


def save_instance_figma_file_key(file_key: str | None) -> None:
    """Persist the Figma file key for the active instance namespace."""
    if file_key is None:
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
    data["figma_file_key"] = file_key or ""
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_instance_egress_allowlist(instance_id: str | None = None) -> list[str]:
    """Per-instance egress allowlist (hostnames; `*.example.com` wildcards).

    Empty list = allow-all (the default), so this is opt-in. Stored in the
    instance's .instance-config.json. `instance_id` lets the proxy read the
    list for the instance a target URL anchors to without the active ContextVar
    being set; defaults to the active instance.
    """
    base = (_BASE_CONTEXTSPEC / instance_id) if instance_id else _instance_dir()
    p = base / _INSTANCE_CONFIG_FILE
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            hosts = data.get("egress_allowlist")
            if isinstance(hosts, list):
                return [str(h).strip() for h in hosts if str(h).strip()]
        except (json.JSONDecodeError, OSError):
            pass
    return []


def set_instance_egress_allowlist(hosts: list[str], instance_id: str | None = None) -> None:
    """Persist the egress allowlist for the active (or given) instance namespace."""
    base = (_BASE_CONTEXTSPEC / instance_id) if instance_id else _instance_dir()
    base.mkdir(parents=True, exist_ok=True)
    p = base / _INSTANCE_CONFIG_FILE
    data: dict = {}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    data["egress_allowlist"] = [str(h).strip() for h in hosts if str(h).strip()]
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
    _migrate_vaccines_to_fix_log()
    for filename, template in [
        ("project-concept.md", _PROJECT_CONCEPT_TEMPLATE),
        ("tech-stack.md",      _TECH_STACK_TEMPLATE),
        ("functional-spec.md", _FUNCTIONAL_SPEC_TEMPLATE),
        ("technical-spec.md",  _TECHNICAL_SPEC_TEMPLATE),
        ("constraints.md",     _CONSTRAINTS_TEMPLATE),
        ("fix-log.md",         _FIX_LOG_TEMPLATE),
        ("amendments.md",      _AMENDMENTS_TEMPLATE),
        ("maintenance-log.md", _MAINTENANCE_LOG_TEMPLATE),
        ("decisions.md",       _DECISIONS_TEMPLATE),
        ("design-bundle.md",   _DESIGN_BUNDLE_TEMPLATE),
    ]:
        p = _path(filename)
        if not p.exists():
            p.write_text(template, encoding="utf-8")
    _migrate_legacy_vaccine_section()
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


def _migrate_vaccines_to_fix_log() -> None:
    """One-time rename: vaccines.md → fix-log.md (the file was renamed for clarity).

    Runs before template creation so a fresh fix-log.md is not created empty ahead of
    the legacy content. Rewrites the old headings to the new scheme. Idempotent.
    """
    old = _path("vaccines.md")
    new = _path("fix-log.md")
    if not old.exists():
        return
    old_content = old.read_text(encoding="utf-8")
    if new.exists():
        # Both present (partial prior migration): fold any records into fix-log.md.
        records = re.search(r"## (?:Vaccine|Fix) #.*", old_content, re.DOTALL)
        if records:
            new.write_text(
                new.read_text(encoding="utf-8").rstrip() + "\n" + records.group(0).rstrip() + "\n",
                encoding="utf-8",
            )
    else:
        rewritten = (old_content
                     .replace("# Vaccine Records", "# Fix Log", 1)
                     .replace("## Vaccine #", "## Fix #"))
        new.write_text(rewritten, encoding="utf-8")
    old.unlink()
    _logger.info("_migrate_vaccines_to_fix_log: renamed vaccines.md → fix-log.md")


def _migrate_legacy_vaccine_section() -> None:
    """One-time migration: move the # Vaccine Records section out of memory-bank.md.

    Legacy memory-bank.md files had a '# Vaccine Records' section appended at the bottom.
    No-op when memory-bank.md no longer exists (already migrated by _migrate_memory_bank).
    Idempotent — safe to call on every init.
    """
    mb = _path("memory-bank.md")
    vx = _path("fix-log.md")
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
        records = records_match.group(0).replace("## Vaccine #", "## Fix #")
        fix_log_content = vx.read_text(encoding="utf-8")
        vx.write_text(
            fix_log_content.rstrip() + "\n" + records.rstrip() + "\n",
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


def get_fix_log() -> str:
    """Return fix-log.md content."""
    init_context()
    vx = _path("fix-log.md")
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
    if match:
        return match.group(0).strip()
    # Unified project-level format (write_project_technical_spec): no per-story
    # block, so fall back to the '## Project Design' contract — mirrors
    # get_story_design_bundle. Without this the unified technical spec never
    # reaches Phase 3–6 prompts. Everything from the block to EOF is the
    # contract: the section content carries its own '## Endpoints'/'## Data
    # Model' headings (so a heading-bounded regex truncates after the block
    # header), and any old-style '## Design Delta' blocks belong in it too.
    m = re.search(r"^## Project Design\b", content, re.MULTILINE)
    return content[m.start():].strip() if m else ""


def get_context_sizes() -> dict[str, int]:
    """Return character counts for each context file (used for sidebar size indicator)."""
    return {
        name: (len(_path(name).read_text(encoding="utf-8")) if _path(name).exists() else 0)
        for name in (
            "project-concept.md",
            "tech-stack.md",
            "functional-spec.md",
            "technical-spec.md",
            "fix-log.md",
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
    with _index_lock():
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
    with _index_lock():
        sif = _path("story-index.json")
        sif.write_text(
            json.dumps(index, indent=2, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )
        _story_index_caches[key] = (_index_file_mtime(sif), index)


# ---------------------------------------------------------------------------
# Autopilot job persistence (one in-flight job per project, for resume-after-
# restart). Stored alongside the story index in the active project's dir.
# ---------------------------------------------------------------------------

_AUTOPILOT_JOB_FILE = "autopilot-job.json"


def save_autopilot_job(snapshot: dict) -> None:
    """Persist the autopilot job snapshot for the active project."""
    _path(_AUTOPILOT_JOB_FILE).write_text(
        json.dumps(snapshot, ensure_ascii=False), encoding="utf-8",
    )


def load_autopilot_job() -> dict | None:
    """Load the persisted autopilot job for the active project, or None."""
    p = _path(_AUTOPILOT_JOB_FILE)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return None


def delete_autopilot_job() -> None:
    """Remove the persisted autopilot job for the active project (New Run)."""
    _path(_AUTOPILOT_JOB_FILE).unlink(missing_ok=True)


def _now_iso() -> str:
    """Machine-readable UTC timestamp for status_history and JSON artifacts.

    Distinct from _now(), whose human format is baked into existing markdown
    headers (fix-log, locked-at lines) — never swap one for the other.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def upsert_story_index(story_id: int, **updates) -> None:
    """Create or update the index entry for a story.

    Only the fields passed as keyword arguments are modified; all other fields
    retain their current values.  Missing entries are created with defaults.

    Valid fields: epic_id, title, phase_status, has_gherkin, has_tech_spec,
                  has_proposal, has_bdd, has_bug_report, has_infra_delta,
                  has_deploy_pack, deploy_bypass, fix_bolt_count,
                  spec_drift, drift_reason,
                  conformance_regressed, regression_reason,
                  trace_flag, trace_phase, trace_reason,
                  design_conflict, conflict_reason.

    Whenever phase_status changes (including the initial status of a new
    entry) a UTC timestamp is appended to entry["status_history"][status] —
    a list, so Fix-Bolt re-entries into the same status are preserved.
    """
    if "phase_status" in updates and updates["phase_status"] not in PHASE_STATUSES:
        raise ValueError(
            f"Invalid phase_status {updates['phase_status']!r}. Must be one of {PHASE_STATUSES}."
        )
    with _index_lock():
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
            "conformance_regressed": False,
            "regression_reason":     "",
            "trace_flag":      False,
            "trace_phase":     "",
            "trace_reason":    "",
            "design_conflict": False,
            "conflict_reason": "",
            "figma_node_id":   "",
            "figma_file_key":  "",
            "figma_synced_at": "",
            "figma_changed":   False,
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
    with _index_lock():
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
    with _index_lock():
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
    with _index_lock():
        index = get_story_index()
        for sid in story_ids:
            index.pop(str(sid), None)
        _save_story_index(index)
    for story_id in story_ids:
        remove_story_from_specs(story_id)


def remove_epic_from_story_index(epic_id: int) -> None:
    """Remove all story index entries for epic_id, the epic sections from both
    spec files, and all associated proposal and BDD files."""
    with _index_lock():
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
        # Unified project design block (write_project_technical_spec). Modern
        # specs carry '**Stories:**' id lines (on the Project Design block and
        # on each appended '## Design Delta' block) — only those stories are
        # marked, so a story pushed AFTER the design lock stays gherkin_locked
        # until a delta covers it. Legacy specs without any Stories line keep
        # the old behaviour (mark all) so existing projects don't regress.
        if re.search(r"^## Project Design\b", tech, re.MULTILINE):
            stories_lines = re.findall(r"^\*\*Stories:\*\* (.+)$", tech, re.MULTILINE)
            designed_ids = {m for line in stories_lines for m in re.findall(r"#(\d+)", line)}
            for sid, entry in index.items():
                if stories_lines and sid not in designed_ids:
                    continue
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
        for name in ("project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md", "fix-log.md")
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


def append_fix_log_record(issue_id: int, root_cause: str, resolution_summary: str) -> None:
    """Append a permanent Fix Log entry for a resolved bug to fix-log.md."""
    init_context()
    vx = _path("fix-log.md")
    content = vx.read_text(encoding="utf-8")

    record = (
        f"\n## Fix #{issue_id} — {_now()}\n\n"
        f"**Root Cause:** {root_cause.strip()}\n\n"
        f"**Resolution:** {resolution_summary.strip()}\n"
    )

    vx.write_text(content.rstrip() + "\n" + record + "\n", encoding="utf-8")


def append_decision_record(scope: str, summary: str, reason: str = "") -> None:
    """Append a dated decision-log entry to decisions.md (append-only).

    `scope` names the artifact (e.g. "Phase 3 dev pack · task #5"); `summary` is
    what was rejected/changed; `reason` is why. Used downstream as a negative
    constraint so the AI stops re-proposing rejected approaches."""
    init_context()
    p = _path("decisions.md")
    content = p.read_text(encoding="utf-8") if p.exists() else _DECISIONS_TEMPLATE
    record = (
        f"\n## {_now_iso()} — {scope.strip() or 'decision'}\n\n"
        f"- **Rejected/changed:** {summary.strip() or '(unspecified)'}\n"
        f"- **Reason:** {reason.strip() or '(none given)'}\n"
    )
    p.write_text(content.rstrip() + "\n" + record + "\n", encoding="utf-8")


def get_decisions() -> str:
    """Read the decisions.md log (empty string if absent)."""
    init_context()
    p = _path("decisions.md")
    return p.read_text(encoding="utf-8") if p.exists() else ""


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


def save_trace_layout(layout: dict) -> None:
    """Persist saved node positions for the traceability graph ({id: {x, y}})."""
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    _path("trace-layout.json").write_text(
        json.dumps(layout, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def load_trace_layout() -> dict:
    """Return saved traceability-graph node positions, or {} if none."""
    p = _path("trace-layout.json")
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


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
    with _index_lock():
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


def load_all_proposals() -> list[dict]:
    """Every developer pack in the project WITH its markdown:
    [{story_id, task_id, proposal_md}]. Cross-story enumeration for the
    design-conflict detector (list_all_proposals omits the markdown)."""
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
                            "proposal_md": p.read_text(encoding="utf-8")})
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
    with _index_lock():
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


def delete_deploy_pack(story_id: int) -> None:
    """Remove a story's deploy pack and clear its has_deploy_pack flag."""
    p = _context_dir() / f"deploy_pack_story_{story_id}.md"
    if p.exists():
        p.unlink()
    upsert_story_index(story_id, has_deploy_pack=False)


def list_all_deploy_packs() -> list[dict]:
    """All saved deploy packs in the project, annotated with story titles."""
    index = get_story_index()
    packs: list[dict] = []
    for entry in index.values():
        if not entry.get("has_deploy_pack"):
            continue
        story_id = entry.get("story_id")
        if not story_id:
            continue
        md = load_deploy_pack(story_id)
        if not md.strip():
            continue
        packs.append({
            "story_id": story_id,
            "title": entry.get("title", ""),
            "chars": len(md),
        })
    return sorted(packs, key=lambda p: p["story_id"])


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
    # Mirror the completeness flag into the index so the analytics summary can
    # read it from the single index file instead of re-reading this JSON per story.
    upsert_story_index(story_id, verification_complete=bool(data.get("complete")))
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
    # Mirror the score into the index so the analytics summary avoids an
    # O(stories) fan-out of per-story conformance reads on the File Share.
    score = data.get("score")
    if isinstance(score, (int, float)):
        upsert_story_index(story_id, conformance_score=int(score))
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


def delete_bug_report(story_id: int) -> None:
    """Remove a story's Fix-Bolt bug report file.

    Unlike delete_deploy_pack, this deliberately KEEPS the has_bug_report flag:
    it also drives Phase-4 Regression Bypass eligibility, so clearing it would
    silently drop an in-flight story's bypass badge + failed-scenario highlights.
    """
    p = _context_dir() / f"bug_report_{story_id}.md"
    if p.exists():
        p.unlink()


def list_all_bug_reports() -> list[dict]:
    """All saved Fix-Bolt bug reports in the project, annotated with story titles."""
    index = get_story_index()
    reports: list[dict] = []
    for entry in index.values():
        if not entry.get("has_bug_report"):
            continue
        story_id = entry.get("story_id")
        if not story_id:
            continue
        md = load_bug_report(story_id)
        if not md.strip():
            continue
        reports.append({
            "story_id": story_id,
            "title": entry.get("title", ""),
            "chars": len(md),
        })
    return sorted(reports, key=lambda r: r["story_id"])


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


def write_project_design_bundle(ux_brief: str) -> None:
    """Overwrite design-bundle.md with the human design artifact (UX Brief).

    The API + data contracts (endpoints, data model) live in technical-spec.md,
    not here — design-bundle is the human-facing UX doc, technical-spec is the
    machine contract injected into Phases 3–6. (Previously this file also stored
    endpoints + data model, duplicating technical-spec.)
    """
    init_context()
    db = _path("design-bundle.md")
    content = (
        "# Design Bundle\n\n"
        f"**Locked at:** {_now()}\n\n"
        "## UX Brief\n\n"
        f"{ux_brief.strip()}\n"
    )
    db.write_text(content, encoding="utf-8")


def read_project_design_bundle() -> dict[str, str]:
    """Parse the locked design-bundle.md back into its three sections.

    Inverse of write_project_design_bundle. Returns empty strings when no
    project-level design has been locked yet (file missing or still the per-epic
    template), so the Phase 2 UI can re-hydrate from the server instead of
    relying solely on browser-local draft state (which is lost on a different
    browser / cleared storage / another device).
    """
    init_context()

    # Anchor on the writer's exact marker lines, not heading-level regexes: the
    # section CONTENT routinely carries its own markdown headings ('## Endpoints',
    # '### <Epic>' …), which a heading-based end-detector mistakes for the next
    # section and truncates. Old-style '## Design Delta' blocks (pre in-place
    # merge) still terminate a section.
    def _read(path_name: str) -> str:
        p = _path(path_name)
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def _span(content: str, start_mark: str, end_mark: str | None) -> str:
        i = content.find(start_mark)
        if i == -1:
            return ""
        i += len(start_mark)
        end = content.find(end_mark, i) if end_mark else -1
        legacy = content.find("\n## Design Delta — ", i)
        cut = min(x for x in (end, legacy, len(content)) if x != -1)
        return content[i:cut].strip()

    tech = _read("technical-spec.md")
    bundle = _read("design-bundle.md")
    return {
        "ux_brief": _span(bundle, _UX_BRIEF_MARK, None),
        "endpoints": _span(tech, _TS_ENDPOINTS_MARK, _TS_DATA_MODEL_MARK),
        "data_model": _span(tech, _TS_DATA_MODEL_MARK, None),
    }


def write_project_technical_spec(story_ids: list[int], endpoints: str, data_model: str) -> None:
    """Overwrite technical-spec.md with the unified machine contract.

    This is the API + data contract (endpoints + data model) injected into
    Phases 3–6 as `technical_spec`. design-bundle.md holds the human UX doc; the
    two no longer share content.

    Writes a '## Project Design' section with a '**Stories:**' id line, so
    rebuild_story_index marks exactly the designed stories design_locked —
    stories pushed AFTER the lock stay gherkin_locked until a design delta
    covers them (legacy specs without the Stories line still mark all).
    """
    init_context()
    ts = _path("technical-spec.md")
    ids_line = ", ".join(f"#{s}" for s in sorted(story_ids))
    content = (
        "# Technical Specification\n\n"
        "> Project API + data contracts (endpoints + data model).\n"
        "> Written automatically by apex after human approval.\n\n"
        "## Project Design\n\n"
        f"**Locked at:** {_now()}\n\n"
        f"**Stories:** {ids_line}\n\n"
        "### Endpoints\n\n"
        f"{endpoints.strip()}\n\n"
        "### Data Model\n\n"
        f"{data_model.strip()}\n"
    )
    ts.write_text(content, encoding="utf-8")
    for story_id in story_ids:
        upsert_story_index(story_id, phase_status="design_locked", has_tech_spec=True)


# The unified writer's literal section markers. Section CONTENT routinely
# carries its own markdown headings ('## Endpoints', '### <Epic>' …), so
# heading-level regexes mis-detect section ends — these exact writer-emitted
# lines are the only reliable anchors.
_TS_ENDPOINTS_MARK = "\n### Endpoints\n"
_TS_DATA_MODEL_MARK = "\n### Data Model\n"
_UX_BRIEF_MARK = "\n## UX Brief\n"
# Old-style appended delta blocks (shipped briefly before in-place merging).
_LEGACY_DELTA_RE = re.compile(r"\n## Design Delta — .*?(?=\n## Design Delta — |\Z)", re.DOTALL)


def _pop_legacy_delta_blocks(content: str) -> tuple[str, list[str]]:
    """Strip old-style '## Design Delta' blocks, returning (content, blocks)."""
    blocks = _LEGACY_DELTA_RE.findall(content)
    return (_LEGACY_DELTA_RE.sub("", content).rstrip() + "\n", blocks) if blocks else (content, [])


def _legacy_delta_parts(block: str) -> tuple[set[str], str, str, str]:
    """Parse one old-style delta block → (story ids, ux body, endpoints, data model)."""
    ids = set(re.findall(r"#(\d+)", re.search(r"^\*\*Stories:\*\* (.+)$", block, re.MULTILINE).group(1))) \
        if re.search(r"^\*\*Stories:\*\* ", block, re.MULTILINE) else set()

    def _sub(header: str) -> str:
        m = re.search(rf"\n### {header} \(delta\)\n+(.*?)(?=\n### \w[^\n]*\(delta\)|\Z)", block, re.DOTALL)
        return m.group(1).strip() if m else ""

    # Bundle-side legacy blocks have no (delta) subsections — the body after the
    # Stories line IS the UX addendum.
    ux = ""
    if "(delta)" not in block:
        body = re.sub(r"^## Design Delta — [^\n]*\n+(\*\*Stories:\*\*[^\n]*\n+)?", "", block.strip())
        ux = body.strip()
    return ids, ux, _sub("Endpoints"), _sub("Data Model")


def _merge_into_section(content: str, insert_at: int, addition: str) -> str:
    return content[:insert_at].rstrip() + f"\n\n{addition.strip()}\n" + content[insert_at:]


def append_design_delta(
    story_ids: list[int],
    ux_brief_addendum: str,
    endpoints_delta: str,
    data_model_delta: str,
) -> dict:
    """Merge an additive design delta for post-lock stories INTO the locked
    sections in place — endpoints into '### Endpoints', entities into
    '### Data Model' (technical-spec.md), the UX addendum into '## UX Brief'
    (design-bundle.md) — so the result reads exactly as if it had been designed
    from the start (and downstream consumers that parse the sections, like the
    screen-flow builder, pick it up for free). No separate delta section is
    written; the audit trail is the '**Stories:**' id line, the MINOR semver
    bump, and (when the delta touches existing design) the amendment record.
    Any old-style '## Design Delta' blocks found are folded into the sections
    first, so files from the brief append-block era self-heal.

    Transitions the covered stories to design_locked and bumps the touched
    artifacts' semver MINOR: a delta is the one edit the system can PROVE is
    additive, so it earns the non-breaking bump that ordinary amendments
    (always MAJOR) cannot.
    """
    init_context()
    stamp = _now()
    new_ids = {str(s) for s in story_ids}

    # ── technical-spec.md ────────────────────────────────────────────────
    ts = _path("technical-spec.md")
    content = ts.read_text(encoding="utf-8") if ts.exists() else ""
    if _TS_ENDPOINTS_MARK not in content or _TS_DATA_MODEL_MARK not in content:
        raise ValueError("technical-spec.md has no unified Project Design sections to merge into.")
    content, legacy_blocks = _pop_legacy_delta_blocks(content)
    ep_additions = [endpoints_delta.strip()] if endpoints_delta.strip() else []
    dm_additions = [data_model_delta.strip()] if data_model_delta.strip() else []
    for block in legacy_blocks:
        ids, _, ep, dm = _legacy_delta_parts(block)
        new_ids |= ids
        if ep:
            ep_additions.insert(0, ep)
        if dm:
            dm_additions.insert(0, dm)
    # Endpoints section ends where the writer's Data Model marker begins;
    # Data Model runs to EOF once legacy blocks are folded away.
    for addition in ep_additions:
        content = _merge_into_section(content, content.index(_TS_DATA_MODEL_MARK), addition)
    for addition in dm_additions:
        content = content.rstrip() + f"\n\n{addition}\n"
    # Extend the Project Design '**Stories:**' line so rebuild_story_index
    # marks the newly covered stories (legacy specs without the line mark all).
    m = re.search(r"^\*\*Stories:\*\* (.+)$", content, re.MULTILINE)
    if m:
        all_ids = {i for i in re.findall(r"#(\d+)", m.group(1))} | new_ids
        ids_line = ", ".join(f"#{i}" for i in sorted(all_ids, key=int))
        content = content[:m.start()] + f"**Stories:** {ids_line}" + content[m.end():]
    ts.write_text(content, encoding="utf-8")
    versions = {"technical-spec.md": _bump_spec_version("technical-spec.md", part="minor")}

    # ── design-bundle.md ─────────────────────────────────────────────────
    db = _path("design-bundle.md")
    db_content = db.read_text(encoding="utf-8") if db.exists() else ""
    db_content, db_legacy = _pop_legacy_delta_blocks(db_content)
    ux_additions = [_legacy_delta_parts(b)[1] for b in db_legacy]
    ux_additions = [u for u in ux_additions if u]
    if ux_brief_addendum.strip():
        ux_additions.append(ux_brief_addendum.strip())
    if ux_additions and _UX_BRIEF_MARK in db_content:
        # UX Brief runs to EOF once legacy blocks are folded away.
        for addition in ux_additions:
            db_content = db_content.rstrip() + f"\n\n{addition}\n"
        db.write_text(db_content, encoding="utf-8")
        versions["design-bundle.md"] = _bump_spec_version("design-bundle.md", part="minor")

    for story_id in story_ids:
        upsert_story_index(story_id, phase_status="design_locked", has_tech_spec=True)
    return {"locked_at": stamp, "story_ids": sorted(story_ids), "versions": versions}


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
# (fix-log.md, github-context.md, figma-context.md) are not spec locks and never
# trigger drift (any file absent from _SPEC_LOCK_PHASE is exempt).
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


# ---------------------------------------------------------------------------
# Semver for lockable spec artifacts. "1.0.0" the moment a file first locks
# (lazily reported — no write needed until something actually changes); every
# post-lock amendment bumps MAJOR, since record_amendment() already treats
# every amendment as breaking (it flags ALL affected stories with spec_drift,
# unconditionally). MINOR/PATCH are reserved: nothing in the current data
# model distinguishes a "safe" edit from a breaking one, so faking that
# distinction here would just be noise — bump MAJOR honestly instead of
# inventing granularity the system can't actually detect.
# ---------------------------------------------------------------------------

_SPEC_VERSION_FILE = "spec-versions.json"


def _versions_lock():
    """Serialise spec-versions.json read-modify-write, same pattern as _index_lock."""
    return distributed.reentrant_lock("apex:spec-versions-write")


def get_spec_version(filename: str) -> str:
    """Current semver for a lockable spec artifact.

    "0.0.0" — not a versioned artifact, or still pre-lock (draft).
    "1.0.0" — locked, never amended since (lazily implied, not persisted).
    "N.0.0" — locked and amended N-1 times since.
    """
    if filename not in _SPEC_LOCK_PHASE:
        return "0.0.0"
    p = _path(_SPEC_VERSION_FILE)
    stored = None
    if p.exists():
        try:
            stored = json.loads(p.read_text(encoding="utf-8")).get(filename)
        except json.JSONDecodeError:
            stored = None
    if stored:
        return stored
    return "1.0.0" if affected_stories_for_spec(filename) else "0.0.0"


def _bump_spec_version(filename: str, part: str = "major") -> str:
    """Bump filename's version, persist, return the new version.

    part="major" (the default) is every amendment — record_amendment() treats
    all post-lock edits as breaking. part="minor" is reserved for the one edit
    the system can PROVE is additive: a design delta appended for new stories
    (nothing existing changed, so nothing downstream drifts).
    """
    with _versions_lock():
        p = _path(_SPEC_VERSION_FILE)
        try:
            data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        except json.JSONDecodeError:
            data = {}
        current = data.get(filename) or get_spec_version(filename)
        major, minor = (int(x) for x in current.split(".")[:2])
        new = f"{major}.{minor + 1}.0" if part == "minor" else f"{major + 1}.0.0"
        data[filename] = new
        p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return new


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
    """Append a dated amendment entry to amendments.md, bump the artifact's
    semver MAJOR version, and flag the affected stories with spec_drift so
    downstream artifacts get re-derived."""
    init_context()
    new_version = _bump_spec_version(filename)
    am = _path("amendments.md")
    header = am.read_text(encoding="utf-8") if am.exists() else _AMENDMENTS_TEMPLATE
    ids = ", ".join(f"#{s}" for s in story_ids) or "(none)"
    block = (
        f"\n## {_now_iso()} — {filename} (→ v{new_version})\n\n"
        f"- **Affected stories:** {ids}\n"
        f"- **Note:** {note.strip() or '(none)'}\n"
    )
    am.write_text(header.rstrip() + "\n" + block, encoding="utf-8")
    with _index_lock():
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
    with _index_lock():
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


def set_conformance_regressed(story_id: int, reason: str = "") -> None:
    """Flag a story whose spec↔code conformance regressed after a code change.

    Distinct from spec_drift (a post-lock SPEC edit): this fires when the CODE
    changed and a re-scan found a lower conformance score or a worsened row."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None:
            entry["conformance_regressed"] = True
            entry["regression_reason"] = reason
            _save_story_index(index)


def clear_conformance_regressed(story_id: int) -> None:
    """Clear the regression flag (acknowledged, or a later scan showed recovery)."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None and entry.get("conformance_regressed"):
            entry["conformance_regressed"] = False
            entry["regression_reason"] = ""
            _save_story_index(index)


def set_trace_flag(story_id: int, phase: str, reason: str = "") -> None:
    """Backward trace: flag a story whose downstream failure traces to an earlier
    spec, suggesting `phase` (a phase_status) be re-opened. Suggest-only — never
    changes phase_status itself."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None:
            entry["trace_flag"] = True
            entry["trace_phase"] = phase
            entry["trace_reason"] = reason
            _save_story_index(index)


def clear_trace_flag(story_id: int) -> None:
    """Clear the backward-trace flag (acknowledged, or a later check found no gap)."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None and entry.get("trace_flag"):
            entry["trace_flag"] = False
            entry["trace_phase"] = ""
            entry["trace_reason"] = ""
            _save_story_index(index)


def set_design_conflict(story_id: int, reason: str = "") -> None:
    """Flag a story whose developer pack overlaps another story's (shared file or
    duplicate endpoint) — a cross-story design-drift warning."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None:
            entry["design_conflict"] = True
            entry["conflict_reason"] = reason
            _save_story_index(index)


def clear_design_conflict(story_id: int) -> None:
    """Clear the design-conflict flag (acknowledged, or a later scan found no overlap)."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None and entry.get("design_conflict"):
            entry["design_conflict"] = False
            entry["conflict_reason"] = ""
            _save_story_index(index)


def set_story_figma_link(
    story_id: int, figma_node_id: str, figma_modified: str = "",
    figma_file_key: str = "",
) -> None:
    """Link (or, with an empty id, unlink) a story to a specific Figma frame node.

    `figma_modified` is the linked file's lastModified timestamp captured at link
    time — the baseline a later scan compares against to detect that the FILE
    changed since the story was linked.
    `figma_file_key` records WHICH file the node lives in (project mode, where a
    story-index can mix files). Empty file key = the workspace's configured single
    file — the legacy behaviour, so old links keep resolving.
    The deep link is rebuilt client-side from the file key + this node id."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None:
            entry["figma_node_id"] = figma_node_id or ""
            if figma_node_id:
                entry["figma_file_key"] = figma_file_key or ""
                entry["figma_synced_at"] = figma_modified or ""
                entry["figma_changed"] = False
            else:
                entry["figma_file_key"] = ""
                entry["figma_synced_at"] = ""
                entry["figma_changed"] = False
            _save_story_index(index)


def scan_figma_changes(current_modified: str) -> list[int]:
    """Flag linked stories whose baseline predates the file's current lastModified.

    Single-file path (unchanged): every linked story is compared against the one
    `current_modified` timestamp. For multi-file (project) workspaces use
    `scan_figma_changes_multi`. A purely lexical compare is correct here: Figma
    lastModified is ISO-8601 UTC, so string order matches chronological order."""
    return scan_figma_changes_multi({"": current_modified}, _default_modified=current_modified)


def scan_figma_changes_multi(
    modified_by_file: dict[str, str], _default_modified: str = "",
) -> list[int]:
    """Per-file drift scan: each linked story is compared against its OWN file's
    current lastModified, looked up by the story's stored `figma_file_key`.

    `modified_by_file` maps file key → current lastModified; the `""` key is the
    workspace's configured single file (so legacy links with no file key resolve
    against it). `_default_modified` is a fallback for a link whose file key is not
    present in the map (used by the single-file wrapper). A story is flagged when
    its file's lastModified is newer than the baseline captured at link time.
    Returns flagged ids."""
    flagged: list[int] = []
    with _index_lock():
        index = get_story_index()
        changed = False
        for entry in index.values():
            node_id = entry.get("figma_node_id")
            if not node_id:
                continue
            file_key = entry.get("figma_file_key", "") or ""
            current = modified_by_file.get(file_key, _default_modified)
            baseline = entry.get("figma_synced_at", "")
            if not (baseline and current and baseline < current):
                continue  # file unchanged since this story's baseline → no drift

            if not entry.get("figma_changed"):
                entry["figma_changed"] = True
                changed = True
            sid = entry.get("story_id")
            if sid is not None:
                flagged.append(sid)
        if changed:
            _save_story_index(index)
    return sorted(flagged)


def acknowledge_figma_change(
    story_id: int, current_modified: str = "", figma_file_key: str = "",
) -> None:
    """Clear the design-changed flag and re-baseline to the current file version."""
    with _index_lock():
        index = get_story_index()
        entry = index.get(str(story_id))
        if entry is not None:
            entry["figma_changed"] = False
            if current_modified:
                entry["figma_synced_at"] = current_modified
            if figma_file_key:
                entry["figma_file_key"] = figma_file_key
            _save_story_index(index)


# ---------------------------------------------------------------------------
# Phase 6 Maintenance — feedback triage items (F1/F2)
# ---------------------------------------------------------------------------

_MAINTENANCE_FILE = "maintenance_items.json"


def load_maintenance_items() -> list[dict]:
    """All maintenance items, newest first. [] if none."""
    init_context()
    p = _path(_MAINTENANCE_FILE)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        items = data.get("items", []) if isinstance(data, dict) else []
        return sorted(items, key=lambda i: i.get("id", 0), reverse=True)
    except (json.JSONDecodeError, OSError):
        return []


def get_maintenance_item(item_id: int) -> dict | None:
    return next((i for i in load_maintenance_items() if i.get("id") == item_id), None)


def _write_maintenance_items(items: list[dict]) -> None:
    cd = _context_dir()
    cd.mkdir(parents=True, exist_ok=True)
    (cd / _MAINTENANCE_FILE).write_text(
        json.dumps({"items": items}, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def create_maintenance_item(
    *,
    subject: str,
    description: str = "",
    evidence: str = "",
    source: str = "manual",
    ext_ref: str = "",
    linked_story_id: int | None = None,
) -> dict:
    """Create a new maintenance item with a sequential id. Returns the item."""
    with _index_lock():
        # Read raw (unsorted) to compute the next id safely.
        p = _path(_MAINTENANCE_FILE)
        items: list[dict] = []
        if p.exists():
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                items = raw.get("items", []) if isinstance(raw, dict) else []
            except (json.JSONDecodeError, OSError):
                items = []
        next_id = max((i.get("id", 0) for i in items), default=0) + 1
        now = _now_iso()
        item = {
            "id": next_id,
            "source": source,
            "ext_ref": ext_ref,
            "subject": subject,
            "description": description,
            "evidence": evidence,
            "linked_story_id": linked_story_id,
            "classification": "unclassified",
            "status": "new",
            "diagnosis_md": "",
            "fix_brief_md": "",
            "lane": None,
            "ai_rationale": {},
            "created_at": now,
            "updated_at": now,
        }
        items.append(item)
        _write_maintenance_items(items)
        return item


def update_maintenance_item(item_id: int, **updates) -> dict | None:
    """Patch a maintenance item's fields. Returns the updated item or None."""
    with _index_lock():
        p = _path(_MAINTENANCE_FILE)
        if not p.exists():
            return None
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            items = raw.get("items", []) if isinstance(raw, dict) else []
        except (json.JSONDecodeError, OSError):
            return None
        target = None
        for it in items:
            if it.get("id") == item_id:
                it.update(updates)
                it["id"] = item_id
                it["updated_at"] = _now_iso()
                target = it
                break
        if target is None:
            return None
        _write_maintenance_items(items)
        return target


def delete_maintenance_item(item_id: int) -> bool:
    """Remove a maintenance item. Returns True if an item was deleted."""
    with _index_lock():
        p = _path(_MAINTENANCE_FILE)
        if not p.exists():
            return False
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            items = raw.get("items", []) if isinstance(raw, dict) else []
        except (json.JSONDecodeError, OSError):
            return False
        remaining = [it for it in items if it.get("id") != item_id]
        if len(remaining) == len(items):
            return False
        _write_maintenance_items(remaining)
        return True


def append_maintenance_log(item_id: int, subject: str, event: str, detail: str = "") -> None:
    """Append a human-readable maintenance event to maintenance-log.md."""
    init_context()
    ml = _path("maintenance-log.md")
    header = ml.read_text(encoding="utf-8") if ml.exists() else _MAINTENANCE_LOG_TEMPLATE
    block = (
        f"\n## {_now_iso()} — Item #{item_id}: {subject.strip()}\n\n"
        f"- **Event:** {event}\n"
    )
    if detail.strip():
        block += f"- **Detail:** {detail.strip()}\n"
    ml.write_text(header.rstrip() + "\n" + block, encoding="utf-8")


def get_maintenance_log() -> str:
    init_context()
    ml = _path("maintenance-log.md")
    return ml.read_text(encoding="utf-8") if ml.exists() else ""


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
    "fix-log.md":         _FIX_LOG_TEMPLATE,
    "design-bundle.md":   _DESIGN_BUNDLE_TEMPLATE,
    "github-context.md":  _GITHUB_CONTEXT_TEMPLATE,
    "figma-context.md":   _FIGMA_CONTEXT_TEMPLATE,
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
    fix-log entries, and index entries are permanently erased.
    """
    _context_dir().mkdir(parents=True, exist_ok=True)
    for filename, template in _TEMPLATES.items():
        _path(filename).write_text(template, encoding="utf-8")
    _save_story_index({})
    clear_draft()
    _initialized_projects.discard(_ctx_key())


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
