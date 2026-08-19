# Plane manual test checklists and smoke record

This file records the latest self-hosted Plane smoke run and keeps the
remaining Plane Cloud checklist runnable. Disposable self-hosted credentials
are acceptable for local agent/human testing; real Plane Cloud credentials and
mailbox acceptance are still human-only and should not be committed here.

---

## 1. Self-hosted UI click-through

Exercises Apex against a self-hosted Plane instance. The first full local
smoke pass was completed on 2026-08-19 against
`scripts/private-plane-cloud.sh`; rerun this checklist whenever Plane
integration code changes.

### Bring the stack up

```bash
cd "/home/thomastabs/Desktop/MEIC-T/Second Year/HumanAICollab/apex"
./scripts/private-plane-cloud.sh --with-frontend --install-cloudflared --tunnel-protocol http2
```

- `--tunnel-protocol http2` only matters if the tunnel starts but never
  prints a `trycloudflare.com` URL (QUIC/UDP blocked) — drop it if your
  network doesn't need it.
- First boot runs Plane's full Django migration set — a few minutes, not a
  hang. Script retries readiness checks for you.
- On success it prints: the tunnel URL, the admin email/password, and a
  ready-to-paste Personal Access Token. Backend on `:8000`, frontend on
  `:3000` (since `--with-frontend` is passed).
- The script starts Apex with `APEX_STORAGE_BACKEND=local` by default so a
  developer `.env` with Azure File Share settings cannot make Active Context
  crawl through remote storage and appear stuck at `0 chars`.
- Ctrl-C stops the tunnel + Apex processes; Plane's Docker services (in
  `~/plane-selfhost` by default) keep running — safe to re-run the script
  later, data persists in named volumes.

### Sign in

1. Open `http://localhost:3000`.
2. Sidebar → PM tool = **Plane**, instance URL = the printed tunnel URL,
   paste the printed PAT. Sign in.

### 2026-08-19 local smoke result

- [x] **Active Context** — `/api/workspace/context-files` returned 200 and
      the sidebar showed non-zero context (`1480 ch`, then `1867 ch` after
      Phase 1 finalize) instead of stale `0 chars`.
- [x] **Project CRUD** — created and deleted a temporary project, then
      created a kept project for the rest of the run. Apex-created Plane
      projects now enable `module_view`, `page_view`, and `issue_views_view`
      on create so free-tier module fallback is writable.
- [x] **Epics/stories board data** — created a module-backed epic and a work
      item story, joined the story to the module, and confirmed the relevant
      Plane endpoints returned 200.
- [x] **Phase 1 → PM finalize** — called the Phase 1 finalize route with
      real Plane UUIDs; it minted durable Apex ids and wrote a one-story
      `story-index.json`.
- [x] **Task Board data** — created a Plane child work item under the story,
      matching Apex's subtask model.
- [x] **Members existing-user path** — added an existing workspace member to
      the project, changed their role to Guest, then removed the membership.
      Plane self-hosted list endpoints require `project-members-lite/` plus
      the create-returned membership id for immediate role/remove actions.
- [x] **Pages status/degraded publish** — self-hosted Community Edition
      returns 404 for project Pages. Status now stays quiet as an empty set;
      publish returns per-file `action: "unsupported_create"` instead of a
      backend 502. Full publish/edit/pull remains a Plane Cloud test.
- [x] **Maintenance triage (Phase 6)** — created a Plane-sourced maintenance
      item from the self-hosted work item (`source: "plane"`, `ext_ref:
      "PLN#1"`).

### Current reusable local environment from the 2026-08-19 run

These values are for the disposable local stack only. If the tunnel dies, run
the script again and use its newly printed URL/PAT instead of editing docs.

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Self-hosted Plane tunnel used in the run:
  `https://favour-eco-morrison-diversity.trycloudflare.com`
- Workspace slug: `apex-selfhost-test`
- Admin user: `admin@localhost.com` / `yourpassword`
- Kept project: `Apex Selfhost Run 002196`
- Kept project identifier: `KT002196`
- Plane project UUID: `2282ad2f-930a-4d7d-a7ac-a96d41c17e75`
- Browser-session Apex shim project id from the run: `2`
- Module/epic UUID: `46288170-cc6b-4f13-8971-e466f60ac356`
- Story UUID: `ad267a74-913a-49e6-b5b8-1f110699e381`
- Task UUID: `bfedb21a-2f31-41ca-8ccb-c3c2b3412f76`
- Maintenance item id: `1`

### Next self-hosted follow-up

- [ ] Repeat the same click-through on a fresh project after the
      `module_view` create-project fix, using only the visible Apex UI where
      practical.
- [ ] Visually inspect Users & Roles after add/change/remove to ensure the
      fixed `project-members-lite/` mapping displays the post-mutation state
      cleanly, not only that the API calls return 2xx.
- [ ] Confirm Pages publish on self-hosted CE shows the degraded
      `unsupported_create` result without an error toast.

Anything that breaks: note the exact step + error (screenshot or the toast
text) and hand it back — that's a real bug report, not a "known limitation."

---

## 2. Plane-Cloud members write-path smoke test

Exercises the invite/role-change/remove write path against real Plane Cloud
(`api.plane.so`), which self-hosted testing above can't fully stand in for
(self-hosted has no real mail delivery, so the "invite lands, invitee
accepts, then gets added to project" full loop can't be observed end-to-end
locally).

### Setup

1. Sign into Apex with your real Plane Cloud PAT (yours — Claude never
   handles this token).
2. Pick (or create) a throwaway workspace/project you're fine inviting a
   second real or disposable email into — Users & Roles panel writes real
   invites against Plane Cloud, not a sandbox.

### Checklist

- [ ] **Invite an existing workspace member to the project** — pick an email
      already in the workspace's member list. Confirm it completes in one
      step (added directly, no separate accept step) and the toast doesn't
      say `scope: "workspace"`.
- [ ] **Invite a brand-new email** (not yet in the workspace) — confirm the
      toast explicitly says it went to the *workspace* (`scope: "workspace"`),
      not the project — this is the documented two-step gap (Plane has no
      atomic project+workspace invite API), not a bug if you see it.
- [ ] **Accept the invite** (open the invite email/link as the invitee, or
      accept from Plane Cloud's own UI if using a second account you
      control) — confirm they now show up in workspace members.
- [ ] **Second `inviteUser` call** for that now-workspace-member email —
      confirm it now completes as a direct project add (the fallback-then-
      retry loop the adapter is built for).
- [ ] **Role change** — change a project member's role (Guest ↔ Member ↔
      Admin). Confirm Plane Cloud's own UI reflects it.
- [ ] **Attempt to promote to Owner** — confirm Apex's UI doesn't offer
      Owner as an assignable role at all (Plane's API has no endpoint that
      grants it — this is enforced by omission, not a rejected request you
      should expect to see).
- [ ] **Remove a member** from the project. Confirm they disappear from
      Apex's Users & Roles panel and from Plane Cloud's own UI.

Anything that breaks: note the exact step + error, hand it back.
