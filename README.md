# Apex

Apex is a Reflex web application that guides a software team through the full SDLC using Claude AI and Taiga. It enforces a **Spec-Anchored** workflow: every phase is gated on human-approved artefacts from the previous one, and a shared context file store feeds every AI call.

<img width="1849" height="958" alt="image" src="https://github.com/user-attachments/assets/28badf7c-1e68-4132-bfed-0eae8c25da64" />
<img width="1849" height="958" alt="image" src="https://github.com/user-attachments/assets/be3c6cd1-4360-4ae9-8260-7176ed7c0fc0" />

## How it works

```mermaid
flowchart TD
    A([Epic]) --> B[Claude NL Draft]
    B --> C{Human Review}
    C -->|edit| B
    C -->|approve| D[Gherkin Compile]
    D --> E{Human Review}
    E -->|edit| D
    E -->|approve| F[Push to Taiga]
    F --> G[(Azure File Share\ncontextspec/project_id/)]
    G --> P2

    subgraph P2[Phase 2 · Design]
        H[Gate 0 — Tech Lead\nConfirm tech stack]
        H --> I[Claude generates\nwireframes · user flow\ncomponent tree · OpenAPI]
        I --> J{Gate 1 — Design Lead\nApprove prototype}
        J -->|edit| I
        J -->|approve| K{Gate 2 — Tech Lead\nApprove spec}
        K -->|edit| I
        K -->|approve| L[Save design bundle]
    end

    L --> G
    G --> M[Phase 3–6 AI calls]

    style A fill:#7c3aed,color:#fff,stroke:none
    style F fill:#7c3aed,color:#fff,stroke:none
    style L fill:#7c3aed,color:#fff,stroke:none
    style G fill:#3b82f6,color:#fff,stroke:none
```

---

## What's implemented

### Phase 1 · Requirements (complete)

- Load or create a Taiga Epic; browse and select from existing epics
- Generate Natural Language user stories via Claude (with AI guidance field)
- Gated on Taiga sign-in, active project, and Project Concept — each missing prerequisite shows a targeted warning
- Edit the NL draft interactively before locking
- Compile into formal Gherkin acceptance criteria; edit per story before pushing
- Push stories to Taiga with tags and board status
- Save approved Gherkin to `functional-spec.md`
- Draft survives page refresh (`.apex-draft.json`, restored on load)
- **AI Suggests** — generate 5–10 scoped Epic candidates from the Project Concept

### Phase 2 · Design (complete)

**Stage A · Tech Stack (Gate 0 — Tech Lead)**
- AI suggests 5 architectural alternatives based on all locked Gherkin stories
- Tech Lead selects, edits, and confirms the tech stack — written to `memory-bank.md`
- One-time per project; re-openable by Tech Lead

**Stage B · Epic Design Bundle (Gate 1 + Gate 2)**
- Select any epic with at least one `gherkin_locked` story
- Claude generates a full design bundle: ASCII wireframes, Mermaid user flow diagram, component tree, and unified OpenAPI/DB schema spec
- Cross-epic consistency: design bundles from already-locked epics are injected into the AI prompt as binding constraints (no duplicate components or flows)
- Live Mermaid preview tab for user flow diagrams
- Visual colour-coded component tree renderer
- Gate 1 (Design Lead): approve wireframes + flow + component tree
- Gate 2 (Tech Lead): approve OpenAPI/DB spec
- Design bundle persisted to `design-bundle.md` on save; restored automatically on epic re-selection
- **Refresh** button: invalidates in-memory cache and re-syncs stories from Taiga + Azure storage
- **Clear Design** button: resets the draft for the current epic

### Sidebar

- **Settings & Connections** — AI model badges, Taiga account (⇄ switch/sign-out), project selector, Epics & Stories board, Users & Roles
- **Active Context** — live editors for context files, scoped per page:
  - Phase 1 → Memory Bank + Functional Spec
  - Phase 2 → Memory Bank + Functional Spec + Technical Spec + Design Bundle
  - Other pages → Memory Bank + Functional Spec + Technical Spec + Vaccine Records
- Char counts, download, and per-file reset

### Phases 3–6

Navigation stubs (Implementation, Testing, Deployment, Maintenance) — present in the UI, not yet implemented.

---

## Architecture

| File / folder | Role |
|---|---|
| `apex/apex.py` | App entry point — `rx.App`, route registration, `on_load` handlers |
| `apex/state/auth.py` | `AuthState` — Taiga token in `rx.Cookie`, login/logout, theme pref in `rx.LocalStorage` |
| `apex/state/project.py` | `ProjectState` — active project ID, project list, config persistence |
| `apex/state/phase1.py` | `Phase1State` — full Phase 1 workflow vars and event handlers |
| `apex/state/phase2.py` | `Phase2State` — Stage A tech stack + Stage B epic design bundle, gates, draft restore |
| `apex/state/board.py` | `BoardState` — Epics & Stories board, CRUD, delete dialogs |
| `apex/state/context.py` | `ContextState` — context file editors (Memory Bank, Functional Spec, etc.) |
| `apex/state/user_mgmt.py` | `UserMgmtState` — member list, roles, invite |
| `apex/pages/` | One page function per phase, referenced by `apex.py` |
| `apex/components/` | Sidebar, nav, Phase 1 and Phase 2 step components, dialogs |
| `src/ai_engine.py` | LangChain + Claude prompts and structured outputs |
| `src/context_manager.py` | Reads/writes context files via `StoragePath` (Azure or local) |
| `src/storage.py` | `StoragePath` — pathlib-compatible wrapper; delegates to Azure File Share SDK when `AZURE_STORAGE_CONNECTION_STRING` is set, falls back to local disk otherwise |
| `src/taiga_adapter.py` | Taiga REST API client (GET/POST/PATCH/DELETE) |
| `rxconfig.py` | Reflex config — ports, theme plugin |
| `tests/` | Pytest test suite — 256 tests, all external APIs mocked |

---

## Tech stack

Python 3.12 · Reflex 0.9 · LangChain · Anthropic Claude · Pydantic · azure-storage-file-share · azure-monitor-opentelemetry · Requests · python-dotenv

---

## Running locally

### Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | 3.10 works but is not recommended by Reflex |
| Node.js 20+ | Required by Reflex for the React frontend build |
| Anthropic API key | Required — set in `.env` |
| Taiga account | Optional upfront — sign in via the sidebar ⇄ button |

### 1 · Environment setup

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...

# Azure File Share — syncs context files between local dev and the deployed app.
# Leave blank to use a local contextspec/ folder instead.
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_FILE_SHARE_NAME=contextspec

# Taiga — filled automatically when you sign in via the sidebar:
TAIGA_API_URL=https://api.taiga.io
TAIGA_PROJECT_ID=
TAIGA_AUTH_TOKEN=

# Optional model overrides:
# AI_MODEL_FAST=claude-haiku-4-5-20251001
# AI_MODEL_CODER=claude-sonnet-4-6
```

> **Never commit `.env`.** It is listed in `.gitignore`.

#### Azure File Share (optional, recommended)

When `AZURE_STORAGE_CONNECTION_STRING` is set, all context reads and writes go through the Azure File Share SDK — the same share the deployed Container App mounts at `/app/contextspec`. Local dev and the deployed instance share the same context files, eliminating sync conflicts between environments.

Without the variable the app falls back to a local `contextspec/` folder. CI always uses this mode (no Azure credentials in the test runner).

### 2 · Local dev server

```bash
pip install -r requirements.txt
reflex run
```

Open [http://localhost:3000](http://localhost:3000). Backend API at [http://localhost:8000](http://localhost:8000).

### 3 · Docker Compose

```bash
docker compose up --build
```

Reads `.env` automatically. If `AZURE_STORAGE_CONNECTION_STRING` is not set, mounts `./contextspec/` as a local volume.

```bash
docker compose down
```

---

## Deployment (Azure Container Apps)

The app is live at **[https://apex-bolt.com](https://apex-bolt.com)**, deployed on Azure Container Apps in France Central.

### Infrastructure

| Resource | Name | Purpose |
|---|---|---|
| Container App | `apex` | Runs the Reflex application |
| Container App Environment | `apex-env` | Networking and shared config |
| Storage Account | `apexctxstore` | Azure File Share for context files |
| File Share | `contextspec` | Mounted at `/app/contextspec` in the container |
| Log Analytics Workspace | `apex-logs` | Log aggregation backend |
| Application Insights | `apex-insights` | Monitoring, error tracking, live metrics |
| Recovery Services Vault | `apex-backup-vault` | Daily backup of the file share (30-day retention) |
| Resource Group | `apex-rg` | All resources, France Central region |

### Ports

In production mode Reflex serves the compiled React frontend from the same port as the API (**8000**). Only port 8000 is exposed. Azure Container App ingress is set to `--target-port 8000 --transport http` with sticky sessions.

### Context persistence

Context files are stored in the Azure File Share under `<taiga_project_id>/` (e.g. `1786966/memory-bank.md`). The Container App mounts the share at `/app/contextspec`; local dev accesses the same files via the Azure File Share SDK when `AZURE_STORAGE_CONNECTION_STRING` is set. Each Taiga project gets its own subdirectory — context never bleeds between projects.

Taiga auth tokens are stored as an `rx.Cookie` (`apex_session`, 7-day TTL) — restored automatically on every page load without a server-side session store.

### CI/CD

Every push to `main` automatically:
1. Runs the full test suite (256 tests, no real credentials needed)
2. Builds and pushes the Docker image to `ghcr.io`
3. Deploys the new revision to Azure Container Apps

### Monitoring (Application Insights)

```kusto
// Errors in the last 24 h
exceptions
| where timestamp > ago(24h)
| project timestamp, type, outerMessage
| order by timestamp desc

// App log messages
traces
| where timestamp > ago(24h)
| project timestamp, message, severityLevel
| order by timestamp desc
```

---

## Tests

All external APIs (Taiga, Anthropic) are mocked — no real credentials needed:

```bash
pip install -r requirements.txt
python3 -m pytest tests/ -v
```

256 tests across `test_ai_engine.py`, `test_context_manager.py`, `test_phase1.py`, `test_phase2.py`, and `test_taiga_adapter.py`.
