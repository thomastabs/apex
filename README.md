# Apex

Apex guides a software team through the SDLC using Claude AI and Taiga. It enforces a **Spec-Anchored** workflow: every phase is gated on human-approved artefacts from the previous one, and a shared context file store feeds every AI call.

This branch contains the migration from the original monolithic Reflex application to a decoupled stack:

- **Backend:** FastAPI, Python services, existing Anthropic/Taiga/context integrations
- **Frontend:** Next.js, TypeScript, React Query, Zustand, Tailwind CSS
- **Local iteration:** split Docker Compose services for backend and frontend

The original Reflex app remains in the repository during the migration for reference and parity checks.

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

- FastAPI endpoints for loading epics, suggesting epics, generating Natural Language drafts, compiling Gherkin, and pushing locked stories to Taiga
- Next.js workflow screen for Create New, Load from Taiga, and AI Suggests modes
- NL draft review/edit flow
- Gherkin compile/review flow
- Push to Taiga and save approved Gherkin to `functional-spec.md`
- Story index entries remain compatible with Phase 2 (`gherkin_locked`)

### Phase 2 · Design (complete)

**Stage A · Tech Stack (Gate 0 — Tech Lead)**
- FastAPI endpoint proposes ranked architectural alternatives from all locked Gherkin stories
- Tech Lead can select/edit/lock the chosen stack into `memory-bank.md`
- Next.js Stage A UI is implemented

**Stage B · Epic Design Bundle (Gate 1 + Gate 2)**
- Select any epic with at least one `gherkin_locked` story
- Claude generates a full design bundle: ASCII wireframes, Mermaid user flow diagram, component tree, and unified OpenAPI/DB schema spec
- The locked Tech Stack is injected as a binding constraint so the AI cannot deviate from it
- Cross-epic consistency: design bundles from already-locked epics are injected into the AI prompt as binding constraints
- UX/System Architecture tabs render the generated bundle
- Gate 1 (Design Lead): approve wireframes + flow + component tree
- Gate 2 (Tech Lead): approve OpenAPI/DB spec
- Locking writes `technical-spec.md`, `design-bundle.md`, Memory Bank design decisions, and updates Taiga/story index status

### Sidebar

- Next.js app shell implements the sidebar and top phase navigation
- Light/dark sidebar modes:
  - dark mode follows the Obsidian reference screenshots
  - light mode follows the original Reflex pale sidebar
- Sidebar is resizable and collapsible
- Switch Account supports Taiga token and username/password login
- Project selector, project create/delete, Epics & Stories board, epic/story create/delete, Users & Roles invite, and Active Context file editing are wired through FastAPI workspace endpoints

### Phases 3–6

Navigation stubs (Implementation, Testing, Deployment, Maintenance) are present in the Next.js shell but the workflows are not migrated yet.

---

## Architecture

| File / folder | Role |
|---|---|
| `backend/app/main.py` | FastAPI entry point, CORS, router registration |
| `backend/app/api/phase1.py` | Phase 1 Requirements REST API |
| `backend/app/api/phase2.py` | Phase 2 Design REST API |
| `backend/app/api/workspace.py` | Sidebar/workspace APIs: auth, projects, board, users, context files |
| `backend/app/services/` | Backend service layer wrapping AI, Taiga, context, and phase workflows |
| `backend/app/schemas/` | Pydantic request/response contracts |
| `frontend/app/` | Next.js App Router routes and global providers |
| `frontend/components/` | App shell, sidebar, phase navigation, Phase 1 and Phase 2 workflow screens |
| `frontend/lib/api/` | Typed frontend API clients |
| `frontend/lib/hooks/` | React Query hooks |
| `frontend/lib/stores/` | Zustand session, UI, and Phase 2 draft state |
| `apex/apex.py` | App entry point — `rx.App`, route registration, `on_load` handlers |
| `state/`, `pages/`, `components/` | Legacy Reflex state/pages/components retained during migration |
| `src/ai_engine.py` | LangChain + Claude prompts and structured outputs |
| `src/context_manager.py` | Reads/writes context files via `StoragePath` (Azure or local) |
| `src/storage.py` | `StoragePath` — pathlib-compatible wrapper; delegates to Azure File Share SDK when `AZURE_STORAGE_CONNECTION_STRING` is set, falls back to local disk otherwise |
| `src/taiga_adapter.py` | Taiga REST API client (GET/POST/PATCH/DELETE) |
| `rxconfig.py` | Reflex config — ports, theme plugin |
| `tests/` | Pytest suite. Legacy and migrated backend tests mock external APIs |

---

## Tech stack

Python 3.12 · FastAPI · Next.js · TypeScript · React Query · Zustand · Tailwind CSS · LangChain · Anthropic Claude · Pydantic · azure-storage-file-share · Requests · python-dotenv

Legacy Reflex 0.9 remains available while the migration is in progress.

---

## Running locally

### Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | 3.10 works but is not recommended by Reflex |
| Node.js 20+ | Required by Next.js and Docker frontend parity |
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

# Taiga:
TAIGA_API_URL=https://api.taiga.io

# Optional model overrides:
# AI_MODEL_FAST=claude-haiku-4-5-20251001
# AI_MODEL_CODER=claude-sonnet-4-6

# Next.js frontend:
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

> **Never commit `.env`.** It is listed in `.gitignore`.

#### Azure File Share (optional, recommended)

When `AZURE_STORAGE_CONNECTION_STRING` is set, all context reads and writes go through the Azure File Share SDK — the same share the deployed Container App mounts at `/app/contextspec`. Local dev and the deployed instance share the same context files, eliminating sync conflicts between environments.

Without the variable the app falls back to a local `contextspec/` folder. CI always uses this mode (no Azure credentials in the test runner).

### 2 · Local split-stack dev

```bash
pip install -r requirements.txt

# terminal 1
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# terminal 2
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Backend API is at [http://localhost:8000](http://localhost:8000), health check at `/api/health`.

### 3 · Docker Compose for the migrated stack

```bash
docker compose -f docker-compose.migration.yml up --build
```

The backend runs on port 8000 and the frontend on port 3000. If `AZURE_STORAGE_CONNECTION_STRING` is not set, the backend uses the mounted local `./contextspec/` folder.

```bash
docker compose -f docker-compose.migration.yml down
```

### 4 · Legacy Reflex app

The old Reflex app can still be run for comparison:

```bash
pip install -r requirements.txt
reflex run
```

---

## Deployment (Azure Container Apps)

The app is live at **[https://apex-bolt.com](https://apex-bolt.com)**, deployed on Azure Container Apps in France Central.

The current production deployment is still the legacy Reflex container. The migrated stack changes the deployment shape from one Reflex container to two services:

- `apex-backend`: FastAPI on port 8000
- `apex-frontend`: Next.js on port 3000

Recommended Azure target:

- deploy backend and frontend as separate Azure Container Apps
- set frontend `NEXT_PUBLIC_API_BASE_URL` to the backend ingress URL
- mount Azure File Share only into the backend at `/app/contextspec`
- allow frontend origin in backend CORS
- update health checks to FastAPI `/api/health`

### Infrastructure

| Resource | Name | Purpose |
|---|---|---|
| Container App | `apex` | Current production Reflex app |
| Future Container App | `apex-backend` | FastAPI backend |
| Future Container App | `apex-frontend` | Next.js frontend |
| Container App Environment | `apex-env` | Networking and shared config |
| Storage Account | `apexctxstore` | Azure File Share for context files |
| File Share | `contextspec` | Mounted at `/app/contextspec` in the container |
| Log Analytics Workspace | `apex-logs` | Log aggregation backend |
| Application Insights | `apex-insights` | Monitoring, error tracking, live metrics |
| Recovery Services Vault | `apex-backup-vault` | Daily backup of the file share (30-day retention) |
| Resource Group | `apex-rg` | All resources, France Central region |

### Ports

Legacy Reflex production serves frontend and backend from port 8000.

Migrated local stack:

- FastAPI backend: 8000
- Next.js frontend: 3000

Migrated Azure should expose both services via their own Container App ingress or front them with a gateway/reverse proxy.

### Context persistence

Context files are stored in the Azure File Share under `<taiga_project_id>/` (e.g. `1786966/memory-bank.md`). The Container App mounts the share at `/app/contextspec`; local dev accesses the same files via the Azure File Share SDK when `AZURE_STORAGE_CONNECTION_STRING` is set. Each Taiga project gets its own subdirectory — context never bleeds between projects.

Legacy Taiga auth tokens are stored as an `rx.Cookie` (`apex_session`, 7-day TTL).

Migrated frontend stores the Taiga token and active project in Zustand local storage and sends them to FastAPI as:

- `Authorization: Bearer <taiga_token>`
- `X-Taiga-Project-Id: <project_id>`

### CI/CD

Every push to `main` automatically:
1. Runs the full test suite (256 tests, no real credentials needed)
2. Builds and pushes the Docker image to `ghcr.io`
3. Deploys the new revision to Azure Container Apps

The migrated stack needs CI/CD updates before production cutover:

1. Run Python backend tests
2. Run frontend `npm ci`, `npm run typecheck`, and `npm run build`
3. Build/push backend and frontend images separately
4. Deploy `apex-backend` and `apex-frontend`

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

Focused migrated backend tests:

```bash
python3 -m pytest \
  tests/test_backend_phase1.py \
  tests/test_backend_phase1_api.py \
  tests/test_backend_phase2.py \
  tests/test_backend_phase2_api.py \
  -q
```

Frontend checks:

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

Legacy tests still mock external APIs:

```bash
pip install -r requirements.txt
python3 -m pytest tests/ -v
```
