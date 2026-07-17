---
target: frontend/app/autopilot/page.tsx + frontend/components/autopilot/*
slug: frontend-app-autopilot-page-tsx
timestamp: 2026-07-17T15-04-26Z
total_score: 28
p0: 0
p1: 1
p2: 2
detector: warnings_clean
---

# Impeccable Re-Critique: Autopilot

Method: expanded tool-page pass; detector plus code/design review.

Autopilot is functionally rich and now cleaner under detector review. The segmented-control false positives were removed, off-ramp microtype was normalized, and the artifact viewer no longer uses a side-tab accent stripe.

Remaining issues:
- [P1] The running view still has very high density: status, checkpoints, steering, event log, artifacts, and controls compete in one screen.
- [P2] State colors are semantically helpful but visually busier than the rest of Apex.
- [P2] “Take Over” is a high-stakes mode change and may deserve the same custom confirmation treatment as other destructive or disruptive actions.

Verification:
- Detector over Autopilot setup/run: warning-free after fixes.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test -- --run`: 28 files / 175 tests passed.

