# Apex — User Flow

The Apex workflow from the **user's** perspective: who acts, where a human review
or sign-off gates progress, and how work moves between phases. For the system
architecture see [`architecture.md`](architecture.md).

> **Rendering for the thesis.** GitHub renders Mermaid inline. To export:
> ```bash
> npx -y @mermaid-js/mermaid-cli -i docs/user-flow.md -o user-flow.svg
> ```
> or paste a block into <https://mermaid.live>.

Legend: **rounded** = user action · **rectangle** = AI-assisted step ·
**diamond** = human decision / gate · **green cylinder** = the spec store that
every phase reads from and writes to · **red** = Fix-Bolt remediation.

---

## 1. Entry: sign in and select a project

```mermaid
flowchart TD
    START([Open Apex]) --> AUTH{PM tool?}
    AUTH -->|Taiga| TA[Sign in — user/pass or API token<br/>Cloud or private instance URL]
    AUTH -->|Jira Cloud| JI[Sign in — email + API token]
    TA --> PROJ[Select project]
    JI --> PROJ
    PROJ --> BOARD[Workspace board<br/>stories grouped by phase_status]
    BOARD --> PICK{Pick the next action}

    classDef act fill:#0b2545,stroke:#60a5fa,color:#e5e7eb;
    classDef dec fill:#3a2f0b,stroke:#fbbf24,color:#fef3c7;
    class START,TA,JI,PROJ,BOARD act;
    class AUTH,PICK dec;
```

From the board the user enters whichever phase a story is ready for. `phase_status`
(`new → gherkin_locked → design_locked → implementation → qa → qa_passed →
deployed`) is the state machine that decides what is available.

---

## 2. Full phase flow

```mermaid
flowchart TD
    G[("contextspec/ — spec store")]:::store

    %% ---------- Phase 1 ----------
    subgraph P1["Phase 1 · Requirements"]
        direction TB
        P1a([Select / create epic]) --> P1b[AI drafts NL stories]
        P1b --> P1c{Review &amp; edit drafts}
        P1c -->|approve| P1d[AI compiles Gherkin + EARS constraints]
        P1d --> P1e{Review &amp; edit Gherkin}
        P1e -->|approve| P1f([Push stories to PM tool])
    end

    %% ---------- Phase 2 ----------
    subgraph P2["Phase 2 · Design (project-wide, once)"]
        direction TB
        P2a([Lock tech stack — Gate 0]) --> P2b[AI generates design bundle<br/>screens · flows · specs]
        P2b --> P2c{Design Lead sign-off — Gate 1}
        P2c -->|approve| P2d{Tech Lead sign-off — Gate 2}
        P2d -->|approve| P2e([Lock design artefacts])
    end

    %% ---------- Phase 3 ----------
    subgraph P3["Phase 3 · Implementation Assist"]
        direction TB
        P3a([Select story]) --> P3b[AI breaks story into tasks]
        P3b --> P3c{Review &amp; edit tasks}
        P3c -->|approve| P3d([Push tasks to PM tool])
        P3d --> P3e[AI generates developer pack per task]
        P3e --> P3f([Lock story — implementation ready])
    end

    %% ---------- Phase 4 ----------
    subgraph P4["Phase 4 · Testing"]
        direction TB
        P4a([Select story to test]) --> P4b[AI generates test plan]
        P4b --> P4c([Execute scenarios — mark pass/fail])
        P4c --> P4d{All pass?}
        P4d -->|fail| P4e[Bug Isolation Wizard<br/>→ Fix-Bolt vaccine + bug report]:::fix
        P4d -->|pass| P4f([Lock qa_passed])
    end

    %% ---------- Phase 5 ----------
    subgraph P5["Phase 5 · Deployment"]
        direction TB
        P5a([Select QA-passed story]) --> P5b[AI pre-flight: infra delta + traceability matrix]
        P5b --> P5c{Infra changes?}
        P5c -->|yes| P5d[AI generates deploy pack<br/>scripts + rollback]
        P5c -->|no| P5e{Deployment Gate<br/>Tech Lead + DevOps}
        P5d --> P5e
        P5e -->|reject| P5f[Security feedback → AI revises pack]
        P5f --> P5d
        P5e -->|approve| P5g([Lock deployed — deployment-log.md])
    end

    %% ---------- Phase 6 ----------
    subgraph P6["Phase 6 · Maintenance &amp; Traceability"]
        direction TB
        P6a([Maintenance event]) --> P6b{Triage: change request or bug?}
        P6b -->|bug| P6c[AI narrows diagnosis<br/>→ Fix-Bolt brief → vaccine]:::fix
        P6c --> P6d{Severity routing}
    end

    %% ---------- flow between phases ----------
    P1f -.->|gherkin_locked| G
    G --> P2a
    P2e -.->|design_locked| G
    G --> P3a
    P3f -.->|implementation| G
    G --> P4a
    P4f -.->|qa_passed| G
    P4e -->|re-enters Phase 4| P4a
    G --> P5a
    P5g -.->|deployed| G
    G --> P6a
    P6d -->|Fast Lane| P5g
    P6d -->|Secure Lane| P4a
    P6b -->|change request| P1a

    classDef store fill:#0b3b2e,stroke:#34d399,color:#d1fae5;
    classDef fix fill:#3b0b14,stroke:#f87171,color:#fee2e2;
```

---

## 3. Who does what

| Phase | User role(s) | Human gate before lock |
|---|---|---|
| 1 · Requirements | PM / BA | Review NL drafts **and** compiled Gherkin |
| 2 · Design | Design Lead + Tech Lead | Gate 0 (tech stack) → Gate 1 (Design Lead) → Gate 2 (Tech Lead) |
| 3 · Implementation | Developer / Tech Lead | Review & edit the task breakdown |
| 4 · Testing | QA | Testing Gate — every scenario marked pass before `qa_passed` |
| 5 · Deployment | Tech Lead + DevOps | Deployment Gate (two-party sign-off; reject loops back) |
| 6 · Maintenance | Maintainer / Tech Lead | Triage decision + severity routing |

Every AI output is a **suggestion**: nothing advances `phase_status` until a human
reviews, edits if needed, and explicitly locks it. The spec store is the contract
between phases — each phase consumes the locked artefacts of the previous one.
