---
target: frontend/app/phase3/page.tsx
total_score: 27
p0_count: 0
p1_count: 2
slug: frontend-app-phase3-page-tsx
---

Method: dual-agent grouped (A: Lovelace design review · B: Heisenberg detector/browser evidence)

# Critique: frontend/app/phase3/page.tsx

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Tasks, packs, PM refs, and lock state are visible. |
| 2 | Match System / Real World | 3 | Strong implementation-planning model. |
| 3 | User Control and Freedom | 3 | Edit/preview/export paths are good. |
| 4 | Consistency and Standards | 3 | Detector is clean. |
| 5 | Error Prevention | 3 | Lock and PM push now require confirmation. |
| 6 | Recognition Rather Than Recall | 3 | Scenario coverage and task context are visible. |
| 7 | Flexibility and Efficiency | 3 | Generate all/export/copy affordances help. |
| 8 | Aesthetic and Minimalist Design | 2 | Stage C is crowded. |
| 9 | Error Recovery | 2 | Native confirm and hover-only actions need better system treatment. |
| 10 | Help and Documentation | 2 | AI-asserted coverage needs stronger explanation near lock. |
| **Total** | | **27/40** | **Solid, with interaction polish remaining** |

## Anti-Patterns Verdict

LLM assessment: Strongest early-phase surface. It feels like a real implementation ledger, not an AI mockup.

Deterministic scan: `detect.mjs` returned `[]` for `phase3/page.tsx`, `phase3-workflow.tsx`, and `task-dag-panel.tsx`.

Browser evidence: `/phase3` rendered correctly and targeted e2e passed. Browser probes still showed horizontal overflow at 375px/768px and axe found one unnamed button plus contrast/link-name issues from the composed shell.

## What's Working

- Traceability is strong: `US#`, task refs, coverage, packs, branch names, PM/GitHub actions.
- Power-user affordances exist: Generate All, copy prompts/briefs, export zip, edit/preview.
- High-stakes lock and PM push now have safety friction.

## Priority Issues

[P1] Hover-only task actions.
Edit/reorder/delete/PM-link controls hidden behind hover are risky for keyboard and touch users.

[P1] Stage C cognitive load.
Task sidebar, selected task detail, branch chip, hint input, generate/restore/copy/download, edit/preview, progress, and DAG compete in one workspace.

[P2] Native confirms are under-designed.
Replace `window.confirm` with Apex’s own confirmation dialog showing IDs, counts, affected systems, and irreversible effects.

[P2] AI-asserted coverage needs stronger lock framing.
The UI says “AI-asserted,” but lock still treats coverage as a trusted record.

[P3] Visual softness drifts from ledger spec.
Some `rounded-xl` and light-mode shadow use feels softer than the flat-by-default system.

## Persona Red Flags

Alex, power user: No visible keyboard path for next task, copy brief, Generate All, or lock.

Sam, keyboard/touch user: Hover-revealed controls may be missed.

Riley, stress tester: Partial pack/coverage consequences need clearer final review.

## Recommended Next Commands

- `/impeccable harden frontend/components/phase3-workflow.tsx`
- `/impeccable layout frontend/components/phase3-workflow.tsx`
- `/impeccable adapt frontend/components/sidebar.tsx`
