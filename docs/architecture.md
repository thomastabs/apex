# Apex — System Architecture

A reference architecture diagram for the Apex Spec-Anchored Human–AI Collaboration
Framework, suitable for inclusion in the thesis. The companion document
[`user-flow.md`](user-flow.md) covers the workflow from the user's perspective.

> **Rendering for the thesis.** GitHub renders the Mermaid blocks below inline.
> To export a vector/raster copy:
> ```bash
> npx -y @mermaid-js/mermaid-cli -i docs/architecture.md -o architecture.svg
> npx -y @mermaid-js/mermaid-cli -i docs/architecture.md -o architecture.pdf
> ```
> or paste a block into <https://mermaid.live> and export SVG/PNG.

---

## 1. High-level architecture

Split stack: a Next.js browser app, a single-writer FastAPI backend that owns all
workflow logic and reverse-proxies every project-management call, a versioned
spec store (`contextspec/`), and pluggable external services (PM tools, AI
providers, GitHub).

```mermaid
flowchart TB
    subgraph CLIENT["🖥️ Browser — Next.js 15 App Router (TypeScript, Tailwind)"]
        direction TB
        UI[Phase 1–6 workflow components<br/>+ sidebar workspace]
        RQ[React Query 5<br/>server state / caching]
        ZS[Zustand stores<br/>apex-session · phase drafts]
        subgraph PM["PM adapter layer"]
            direction TB
            FAC[pm-factory.getPmAdapter] --> TAD[taiga-adapter]
            FAC --> JAD[jira-adapter]
            TAD --> TDIR[taiga-direct.ts<br/>sends X-Taiga-Url]
        end
        GHB[github-browser.ts<br/>PAT stays in browser]
        UI --> RQ --> PM
        UI --> ZS
    end

    subgraph BACKEND["⚙️ FastAPI backend — Azure Container Apps · workers=1 · max 1 replica (single writer)"]
        direction TB
        MW[main.py<br/>CORS · body-limit middleware]
        subgraph ROUTERS["API routers (thin)"]
            direction TB
            RP[phase1–6 · workspace · analytics]
            TPROX[taiga_proxy.py<br/>SSRF guard · _egress]
            JPROX[jira_proxy.py<br/>SSRF guard]
            DEPS[deps.py<br/>auth · rate-limit · token cache]
        end
        subgraph SERVICES["services/ — all workflow logic"]
            direction TB
            CS[ContextService<br/>isolation + caching seam]
            MS[maintenance_service · phase services]
            PH[pm_http.send_with_retry]
        end
        AIE[ai_engine.py<br/>provider routing · typed errors]
        CM[context_manager.py<br/>templates · story-index · ContextVars]
        ST[storage.py<br/>StoragePath abstraction]
        MW --> ROUTERS
        RP --> SERVICES
        SERVICES --> CS --> CM --> ST
        SERVICES --> AIE
        TPROX --> PH
        JPROX --> PH
    end

    subgraph STORE["🗄️ Spec store — contextspec/&lt;instance_id&gt;/&lt;project_id&gt;"]
        direction TB
        MD[Markdown context files<br/>functional-spec · tech-stack · constraints · …]
        IDX[story-index.json<br/>phase_status state machine]
    end

    subgraph EXT["☁️ External services"]
        direction TB
        TAIGA[Taiga — api.taiga.io<br/>or private via cloudflared]
        RELAY[Cloudflare Worker relay<br/>non-Azure egress IP]
        JIRA[Jira Cloud<br/>*.atlassian.net]
        GH[GitHub REST API<br/>* CORS]
        AIP[AI providers<br/>Anthropic · OpenAI · Google]
    end

    %% ---- cross-boundary data flows ----
    TDIR -- "/api/pm/taiga/*" --> TPROX
    JAD -- "/api/pm/jira/*" --> JPROX
    GHB -- "browser-direct" --> GH
    TPROX -- direct --> TAIGA
    TPROX -- "Azure egress<br/>(blocked → relay)" --> RELAY --> TAIGA
    JPROX --> JIRA
    AIE --> AIP
    ST <-->|local disk OR<br/>Azure File Share SDK| STORE
    RP -. validates token against .-> TAIGA

    classDef client fill:#0b2545,stroke:#60a5fa,color:#e5e7eb;
    classDef backend fill:#1f2937,stroke:#9ca3af,color:#e5e7eb;
    classDef store fill:#0b3b2e,stroke:#34d399,color:#d1fae5;
    classDef ext fill:#3a2f0b,stroke:#fbbf24,color:#fef3c7;
    class CLIENT,UI,RQ,ZS,PM,FAC,TAD,JAD,TDIR,GHB client;
    class BACKEND,MW,ROUTERS,RP,TPROX,JPROX,DEPS,SERVICES,CS,MS,PH,AIE,CM,ST backend;
    class STORE,MD,IDX store;
    class EXT,TAIGA,RELAY,JIRA,GH,AIP ext;
```

### Layer responsibilities

| Layer | Stack | Responsibility |
|---|---|---|
| **Client** | Next.js 15 (App Router), React 19, React Query 5, Zustand, Tailwind | Renders the Phase 1–6 workflow; React Query owns server state, Zustand owns UI/session/draft state. All PM traffic goes through the adapter layer; only GitHub is called browser-direct. |
| **PM adapter** | `pm-factory` → `taiga-adapter` / `jira-adapter` against the `ProjectManagementAdapter` interface | Single seam for PM operations; new PM operations are added to both adapters + the interface. |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 | Owns all workflow logic; routers are thin and delegate to `services/`. Reverse-proxies every Taiga/Jira call (SSRF-guarded). Single writer (`workers=1`, max 1 replica). |
| **Isolation seam** | `ContextService` + two `ContextVar`s | Per-request project + instance isolation; all context-file / story-index access funnels here for caching + tenancy. |
| **Spec store** | Markdown + `story-index.json` on local disk or Azure File Share | The versioned single source of truth; `phase_status` drives phase gating. |
| **AI** | `ai_engine.py` | Provider chosen by model-ID prefix (`claude-*` / `gpt-*` `o1/o3-*` / `gemini-*`); AI errors map to typed HTTP statuses. |

---

## 2. Multi-tenant request isolation

State is partitioned by **instance** (the validated PM host) **× project**, so Taiga
Cloud and private/self-hosted instances are isolated tenants on the same shared
File Share.

```mermaid
flowchart LR
    REQ[HTTP request<br/>Authorization + X-Taiga-Url] --> DEPS[deps.py<br/>validate token vs anchor]
    DEPS --> SET["ContextService.set_active(ctx)"]
    SET --> CV1[(_active_instance_id<br/>ContextVar)]
    SET --> CV2[(_active_project_id<br/>ContextVar)]
    CV1 --> PATH["StoragePath →<br/>contextspec/&lt;instance_id&gt;/&lt;project_id&gt;/"]
    CV2 --> PATH
    PATH --> DISK[(local disk)]
    PATH --> AFS[(Azure File Share SDK)]

    classDef n fill:#1f2937,stroke:#9ca3af,color:#e5e7eb;
    classDef s fill:#0b3b2e,stroke:#34d399,color:#d1fae5;
    class REQ,DEPS,SET,PATH n;
    class CV1,CV2,DISK,AFS s;
```

`instance_id = instance_key(host)` of the validated PM anchor (e.g. `api_taiga_io`).
The single-writer/single-replica invariant is what makes the per-process caches
(token validation, rate-limit buckets, story-index mtime, workspace-config TTL)
coherent — the backend must **not** be scaled past one replica.

---

## 3. Taiga egress path (Azure deployment)

Taiga Cloud firewall-DROPs Azure Container Apps egress IPs, so the backend routes
`api.taiga.io` traffic through a Cloudflare Worker that presents a non-Azure
source IP. The Worker **must strip `x-forwarded-for`** or the Azure IP leaks back
to Taiga's origin and triggers HTTP 520.

```mermaid
sequenceDiagram
    participant FE as Browser (taiga-direct.ts)
    participant BE as FastAPI taiga_proxy
    participant W as Cloudflare Worker relay
    participant T as api.taiga.io

    FE->>BE: POST /api/pm/taiga/auth (X-Taiga-Url)
    Note over BE: SSRF-validate host<br/>_egress(): is host relay-only?
    alt api.taiga.io (Azure-blocked)
        BE->>W: POST / (X-Relay-Target, X-Relay-Secret)
        Note over W: auth secret · allow-list api.taiga.io<br/>STRIP x-forwarded-for / client-IP headers
        W->>T: forward from Cloudflare IP
        T-->>W: 200 / 401
        W-->>BE: relay response
    else private instance (reachable)
        BE->>T: direct (bypass relay)
        T-->>BE: response
    end
    BE-->>FE: JSON (CORS-safe)
```

---

## 4. Deployment & CI/CD

```mermaid
flowchart LR
    DEV[push to main] --> CI[GitHub Actions ci.yml]
    CI --> TB[test-backend<br/>pytest + ruff]
    CI --> TF[test-frontend<br/>typecheck · vitest · build]
    CI --> TE[test-e2e<br/>Playwright]
    CI --> TR[test-relay<br/>node --test]
    TB & TF & TE --> IMG[build & push images → GHCR]
    IMG --> DEP[deploy → Azure Container Apps<br/>backend + frontend · health-check · rollback]
    TR --> DREL[deploy-relay → Cloudflare<br/>wrangler-action]
    CRON[scale-scheduler.yml<br/>08:00 up / 22:00 down] -.-> DEP

    classDef n fill:#1f2937,stroke:#9ca3af,color:#e5e7eb;
    class DEV,CI,TB,TF,TE,TR,IMG,DEP,DREL,CRON n;
```

- **Backend** pinned to **max 1 replica** (single writer); only the stateless
  frontend scales to zero overnight.
- Storage is the **Azure File Share** (SDK, no FS mount) in production; local disk
  in dev/CI.
- The **relay Worker** deploys independently of the Azure pipeline, only when
  `infra/cloudflare/taiga-relay/` changes.
