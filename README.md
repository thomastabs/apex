# Apex

Apex is a Streamlit web app that guides a software team through the SDLC using Claude AI and Taiga. It turns an Epic into formal Gherkin acceptance criteria, pushes stories to Taiga, and keeps the approved requirements in a persistent context that feeds every subsequent phase.

<img width="1850" height="967" alt="image" src="https://github.com/user-attachments/assets/56b21e8b-cbf7-4174-ac7e-742a6d793a78" />

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
    F --> G[(contextspec/)]
    G --> H[Phase 2–6 AI calls]

    style A fill:#7c3aed,color:#fff,stroke:none
    style F fill:#7c3aed,color:#fff,stroke:none
    style G fill:#3b82f6,color:#fff,stroke:none
```

1. Open Phase 1 and enter or select a Taiga Epic (or use **AI Suggests** to generate candidates from your Project Concept).
2. Claude generates a Natural Language story draft.
3. Review and edit the draft in the UI.
4. The app compiles the draft into strict Gherkin acceptance criteria.
5. Edit story titles and Gherkin per story, then confirm the push.
6. Stories are created in Taiga and the approved Gherkin is written to `contextspec/`.

## What's implemented

### Phase 1 · Requirements (full)

- Load or create a Taiga Epic; browse and select from existing epics
- Generate Natural Language user stories via Claude (with AI guidance field)
- Gated on Taiga sign-in, active project, and Project Concept — each missing prerequisite shows a targeted warning
- Edit the NL draft interactively before locking it in
- Compile the draft into formal Gherkin acceptance criteria
- Edit story titles, sizes, and Gherkin per story before pushing
- Push stories to Taiga with tags and board status
- Save the approved Gherkin to `contextspec/functional-spec.md`
- Draft survives page refresh via `.apex-draft.json`
- **AI Suggests** — generate 5–10 scoped Epic candidates from the Project Concept

### Sidebar

- **Settings & Connections** — AI model status, Taiga account (⇄ switch), project selector, Epics & Stories board, Users & Roles
- **Active Context** — live editor for Memory Bank, Functional Spec, Technical Spec, Vaccine Records
- **SDLC Phases** — phase navigation with progress badges

### Phases 2–6

Present in the UI as navigation stubs: Design, Implementation, Testing, Deployment, Maintenance.

## Architecture

| File / folder | Role |
|---|---|
| `app.py` | Entry point — page config, theme injection, routing |
| `components/sidebar.py` | Sidebar: zones, context editor, AI/Taiga status, board, user management |
| `components/phase1.py` | Full Phase 1 workflow (Requirements + AI Suggests) |
| `src/ai_engine.py` | LangChain + Claude prompts and structured outputs |
| `src/context_manager.py` | Reads/writes `contextspec/` markdown files |
| `src/taiga_adapter.py` | Taiga REST API client (GET/POST/PATCH/DELETE) |
| `views/phase1.py … phase6.py` | Thin Streamlit page wrappers |
| `contextspec/` | Persistent project context (Gherkin, memory bank, etc.) |
| `static/` | CSS files for light/dark theming |
| `tests/` | Pytest test suite (all APIs mocked) |

## Tech stack

Python 3.12 · Streamlit · LangChain · Anthropic Claude · Pydantic · Requests · python-dotenv

---

## Running locally

### Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.12+ | Local dev only |
| Docker 24+ | Container run |
| Anthropic API key | Required — set in `.env` |
| Taiga account | Optional upfront — sign in via the sidebar ⇄ button on first launch |

### 1 · Environment setup

Only the Anthropic key is needed upfront. Taiga credentials are entered via the sidebar on first use and saved automatically.

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...

# Taiga — filled automatically by the app when you sign in via the sidebar:
# TAIGA_API_URL=https://api.taiga.io
# TAIGA_PROJECT_ID=
# TAIGA_AUTH_TOKEN=

# Optional model overrides
# AI_MODEL_FAST=claude-haiku-4-5-20251001
# AI_MODEL_CODER=claude-sonnet-4-6
```

> **Never commit `.env`.** It is listed in `.gitignore`.

### 2 · Local Python

```bash
pip install -r requirements.txt
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501).

### 3 · Docker Compose (recommended)

```bash
docker compose up --build
```

Compose reads `.env` automatically and mounts `contextspec/` as a volume. Open [http://localhost:8501](http://localhost:8501).

```bash
docker compose down   # stop
```

### 4 · Docker (manual)

```bash
docker build -t apex:local .

docker run -e ANTHROPIC_API_KEY=sk-ant-... \
  -p 8501:8501 \
  -v "$(pwd)/contextspec:/app/contextspec" \
  apex:local
```

---

## Deployment (Azure Container Apps)

The app is deployed on Azure Container Apps (France Central) with `contextspec/` persisted on Azure Files.

Every push to `main` automatically:
1. Runs the test suite
2. Builds and pushes the Docker image to `ghcr.io`
3. Deploys the new revision to Azure

**Required GitHub secret:** `AZURE_CREDENTIALS` — a service principal JSON with Contributor access to the `apex-rg` resource group.

---

## Tests

All external APIs are mocked — no real credentials needed:

```bash
pip install -r requirements.txt pytest
python3 -m pytest tests/ -v
```

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

| Job | When | What |
|---|---|---|
| `test` | every push / PR | Runs all pytest tests with stub env vars |
| `build` | after `test` on `main` | Builds and pushes Docker image to `ghcr.io` |
| `deploy` | after `build` on `main` | Deploys new revision to Azure Container Apps |

Registry auth uses the built-in `GITHUB_TOKEN` — no manual secrets needed for the build step.
