# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is an academic/research project implementing **Apex** — a Reflex web application for a Human–AI Collaboration Framework for the SDLC. It integrates Claude (via LangChain) and Taiga to manage requirements, Gherkin acceptance criteria, and project backlog across six SDLC phases.

## Setup

```bash
pip install -r requirements.txt
reflex run
# frontend → http://localhost:3000
# backend  → http://localhost:8000
```

On first launch the sidebar shows a sign-in dialog. Only `ANTHROPIC_API_KEY` must be in `.env` before starting.

### AI Provider
Set in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Optionally override models with `AI_MODEL_FAST` and `AI_MODEL_CODER`.

## Project Structure

```
apex/
  apex.py                    → rx.App entry point, route registration, on_load handlers
  state/
    auth.py                  → AuthState: rx.Cookie token, login/logout, theme (rx.LocalStorage)
    project.py               → ProjectState(AuthState): active project, project list
    board.py                 → BoardState(ProjectState): epics/stories board, CRUD
    context.py               → ContextState(ProjectState): context file editors
    phase1.py                → Phase1State(ProjectState): full NL → Gherkin workflow
    user_mgmt.py             → UserMgmtState(ProjectState): members, roles, invite
  pages/
    phase1.py                → Phase 1 page (full implementation)
    phase2.py … phase6.py    → Stub pages
  components/
    sidebar.py               → Root sidebar (8 sections)
    nav.py                   → Phase nav links, active state from router
    dialogs/                 → switch_account, create_epic, create_story,
                               epic_details, story_details
    phase1/
      step1.py               → Define Epic (new / load / suggest tabs)
      generate.py            → Generate NL section
      review.py              → NL text editor
      compile.py             → Compile button section
      gherkin_review.py      → Per-story Gherkin editors + push controls
rxconfig.py                  → Reflex config (ports 3000/8000, RadixThemesPlugin)
src/
  ai_engine.py               → LangChain + ChatAnthropic; one function per SDLC phase
  taiga_adapter.py           → Taiga REST API (GET/POST/PATCH/DELETE); raises TaigaAPIError
  context_manager.py         → Reads/writes contextspec/ markdown files
tests/
  test_ai_engine.py
  test_taiga_adapter.py
  test_context_manager.py
  test_phase1.py             → Tests validate_stories() + Phase1State event handlers via .fn
contextspec/                 → Persistent project context (auto-created on first push)
  <project_id>/
    memory-bank.md
    functional-spec.md
    technical-spec.md
    vaccines.md
    story-index.json
    .apex-draft.json         → Persisted draft (survives page refresh)
  .apex-config.json          → Active project ID
```

## State Inheritance

```
rx.State
  └── AuthState          (token cookie, theme, login/logout)
        └── ProjectState (active project, project list)
              ├── Phase1State   (NL → Gherkin workflow)
              ├── BoardState    (epics/stories board)
              ├── ContextState  (context file editors)
              └── UserMgmtState (members, roles)
```

Each child state inherits `is_authenticated`, `has_project`, `_sync_token()`, and `active_project_id`.

## Core Modules

### `src/taiga_adapter.py`
- Module-level `_token["value"]` — no framework dependency.
- Event handlers call `self._sync_token()` (sets `taiga_adapter.set_token(self.auth_token)`) before every API call.
- Key functions: `get_epics`, `get_stories`, `create_story`, `create_epic`, `update_story`, `update_epic`, `delete_epic_with_stories`, `get_memberships`, `get_roles`, `invite_member`, `login`, `set_token`

### `src/ai_engine.py`
- `generate_nl_stories()` — NL story draft from Epic (Phase 1 Step 2)
- `compile_gherkin_stories()` — formal Gherkin from NL draft (Phase 1 Step 4)
- `bold_gherkin_keywords()` — wraps Gherkin keywords in `**bold**` for Taiga markdown
- 3-tier fallback: `with_structured_output` → streaming → raw JSON parse

### `src/context_manager.py`
- Reads/writes files under `contextspec/<project_id>/`.
- `init_context`, `append_gherkin`, `get_project_concept`, `get_story_index`
- `save_draft` / `load_draft` / `clear_draft` for `.apex-draft.json`
- `read_context_file(filename)` / `write_context_file(filename, content)` — generic helpers

## Reflex Conventions

### Calling event handlers in tests
`@rx.event` wraps methods as `EventHandler` objects. Call the underlying function via `.fn`:
```python
Phase1State.add_story.fn(state)          # not Phase1State.add_story(state)
Phase1State.delete_story.fn(state, idx)
```

### Dynamic selects
`rx.select()` does not accept `rx.foreach` children. Use the primitive API:
```python
rx.select.root(
    rx.select.trigger(placeholder="…"),
    rx.select.content(rx.foreach(items, lambda i: rx.select.item(i["name"], value=i["id"].to_string()))),
    on_change=...,
)
```

### Nested dict vars in foreach
Reflex cannot infer element types from `dict.get(key, [])` inside `rx.foreach`. Avoid nested dict state vars for iterable data. Use flat lists or computed vars that embed the index:
```python
@rx.var
def stories_with_edits(self) -> list[dict]:
    return [{**s, "index": i, "gherkin_edit": ...} for i, s in enumerate(self.compiled_stories)]
```

### Auto-generated setters
Reflex does **not** auto-generate `set_<var>` event handlers. Add them explicitly for any var used in `on_change` or `on_open_change`:
```python
@rx.event
def set_dialog_open(self, value: bool):
    self.dialog_open = value
```

### Theme
Configured via `rxconfig.py` `RadixThemesPlugin`. `App(theme=...)` is deprecated as of 0.9.0.

## Sidebar Structure

8 sections rendered by `apex/components/sidebar.py`:

1. Logo + theme toggle (stored in `rx.LocalStorage`)
2. Phase navigation (`apex/components/nav.py`)
3. Context editors (accordion — Memory Bank, Functional Spec, Tech Spec, Vaccine Records)
4. Anthropic model status
5. Taiga user + ⇄ switch-account dialog
6. Project selector
7. Epics & Stories board (one epic expanded at a time via `expanded_epic_id`)
8. Users & Roles (invite form, role change)

## Login Gate

`AuthState.is_authenticated` is a computed var over `auth_token: str = rx.Cookie(...)`. The sidebar and Phase 1 components check this and show sign-in prompts or disable buttons when False. There is no hard redirect — unauthenticated users see descriptive placeholders.

## Testing

```bash
python3 -m pytest tests/ -v
```

All external APIs are mocked — no real credentials needed. `pytest.ini` sets `pythonpath = .`.

Unit tests for Reflex state use `_bare_state()` helper (seeds `dirty_vars`) and call event handlers via `.fn` to bypass the `EventHandler` wrapper.

---

## Framework Overview

**Core concept:** Spec-Anchored Continuity — a `.ai-context.md` artifact (split into a Memory Bank and Feature Specs) anchored to the codebase acts as the persistent source of truth for AI agents across the SDLC.

**Key mechanisms:**
- **Apexes** — micro-cycle execution units replacing sprints; governed by Pre-Apex Architectural Lock + Consistency Factors
- **Fix-Apexes** — async bug remediation that bypasses planning but not validation
- **Mob Elaboration** — Trio + AI requirements ritual using an Interactive Bridge (NL ↔ Gherkin translation)
- **Apex Board** — task states: Strategic Alignment → Ready for Discovery → Prototyping & Architecture → Development → Staging → Ready for Production

**Roles:** PM · Trio (PO, Tech Lead, Design Lead) · Apex Master · Developers · QA · DevOps Alliance

**Six Operational Playbooks:** Mob Elaboration · Design & Prototyping · QA Validation · Maintenance & Evolution · Fix-Apex · Deployment & Release
