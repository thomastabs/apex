# Plane manual test checklists

Two open live-testing items from the Plane backlog (see
`docs/plane-integration.md`'s "Known, deliberate limitations" section) that
need a human signed in with real credentials — Claude does not enter
credentials into any sign-in flow, disposable or not, even on direct request.
This file is the runnable script for both; check items off as you go.

---

## 1. Self-hosted UI click-through

Exercises Apex's own UI against a self-hosted Plane instance. No Plane
feature (Project CRUD, epics/stories, members/invites, Pages sync) has been
driven through Apex's UI against self-hosted Plane yet — only direct API
probes and infra reachability.

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
- Ctrl-C stops the tunnel + Apex processes; Plane's Docker services (in
  `~/plane-selfhost` by default) keep running — safe to re-run the script
  later, data persists in named volumes.

### Sign in

1. Open `http://localhost:3000`.
2. Sidebar → PM tool = **Plane**, instance URL = the printed tunnel URL,
   paste the printed PAT. Sign in.

### Click-through checklist

- [ ] **Project CRUD** — create a project (note the required `identifier`
      field, e.g. `TEST` — Plane has no auto-derived slug like Taiga). Edit
      its name/description. Delete it. Create a second one to keep testing.
- [ ] **Epics/stories board** — create an epic, add a couple of stories under
      it, confirm they show up in the board view, filter by text.
- [ ] **Phase 1 → PM push** — run Phase 1 on a story, push it to the PM tool,
      confirm it lands in Plane's own UI (open the self-hosted instance
      directly at the tunnel URL to check).
- [ ] **Task Board (Phase 3)** — push tasks as subtasks, confirm they appear
      grouped by story, edit one inline.
- [ ] **Members/invites** — invite a workspace member by email (self-hosted
      has no real mail relay by default, so expect the `{scope: "workspace"}`
      toast rather than a delivered email — that's the documented behavior,
      not a bug). If you seeded a second admin user via the script's admin
      account, try adding an *existing* member to the project instead — that
      path should complete in one step.
- [ ] **Pages sync** — self-hosted Community Edition has no Pages REST
      endpoint at all (found 2026-08-19 — `pages/` 404s while every other
      project endpoint works fine). The sidebar's Pages panel should show
      "0/0 pages" cleanly, not an error toast. Publish will still fail
      loudly if you click it (nothing to fall back to) — that's expected on
      CE, not a new bug. Only test the actual publish/edit/pull round-trip
      against Plane Cloud, not self-hosted.
- [ ] **Maintenance triage (Phase 6)** — "Sync PM Issues" against the
      self-hosted instance, confirm it lists Plane issues without erroring.

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
