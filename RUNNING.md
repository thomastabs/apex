# Running bolt

Three ways to run the app: local Python, Docker, or Docker Compose.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.12+ | Local dev only |
| Docker | 24+ | Container run |
| Anthropic API key | — | Required |
| Taiga account | — | Required for push actions |

---

## 1 · Environment setup

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Taiga
TAIGA_API_URL=https://api.taiga.io
TAIGA_PROJECT_ID=<your-project-id>
TAIGA_USERNAME=<your-email>
TAIGA_PASSWORD=<your-password>
TAIGA_AUTH_TOKEN=          # leave blank — auto-filled on first run

# Optional model overrides
# AI_MODEL_FAST=claude-haiku-4-5-20251001
# AI_MODEL_CODER=claude-sonnet-4-6
```

> **Never commit `.env`.** It is listed in `.gitignore`.

---

## 2 · Local Python

```bash
pip install -r requirements.txt
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501).

The `openspec/` directory is created automatically on first use.

---

## 3 · Docker

### Build

```bash
docker build -t bolt-cli:local .
```

### Run

Pass your `.env` file directly:

```bash
docker run --env-file .env \
  -p 8501:8501 \
  -v "$(pwd)/openspec:/app/openspec" \
  bolt-cli:local
```

Open [http://localhost:8501](http://localhost:8501).

The `-v` flag mounts your local `openspec/` folder into the container so
context files (`functional-spec.md`, `memory-bank.md`, etc.) survive
container restarts.

### Stop

```bash
docker ps                          # find CONTAINER ID
docker stop <container-id>
```

---

## 4 · Docker Compose (recommended)

```bash
docker compose up --build
```

Open [http://localhost:8501](http://localhost:8501).

Compose reads `.env` automatically and mounts `openspec/` as a named volume.

**Rebuild after code changes:**

```bash
docker compose up --build
```

**Stop:**

```bash
docker compose down
```

---

## 5 · Using the pre-built image (CI/CD)

After a push to `main`, GitHub Actions publishes a fresh image to the
GitHub Container Registry:

```bash
docker pull ghcr.io/thomastabs/bolt-cli:latest

docker run --env-file .env \
  -p 8501:8501 \
  -v "$(pwd)/openspec:/app/openspec" \
  ghcr.io/thomastabs/bolt-cli:latest
```

Pin to a specific commit with its `sha-<hash>` tag to avoid surprise
updates:

```bash
docker run --env-file .env \
  -p 8501:8501 \
  -v "$(pwd)/openspec:/app/openspec" \
  ghcr.io/thomastabs/bolt-cli:sha-86e96ee
```

---

## 6 · Running the tests

Tests mock all external APIs — no real credentials needed:

```bash
pip install -r requirements.txt pytest
python3 -m pytest tests/ -v
```

CI runs the same command on every push and pull request to `main`.

---

## CI/CD pipeline

`.github/workflows/ci.yml` defines two jobs:

| Job | Trigger | What it does |
|---|---|---|
| `test` | every push / PR to `main` | Runs all 178 pytest tests with stub env vars |
| `build` | after `test` passes | Builds the Docker image; pushes to `ghcr.io` on `main` only |

No manual secrets are needed — the pipeline uses the built-in
`GITHUB_TOKEN` for registry auth.
