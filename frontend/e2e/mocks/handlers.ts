/**
 * Shared mock response data for Playwright page.route() interceptors.
 * Applied via applyMocks() in the test fixture.
 */

import type { Page } from "@playwright/test";

const FAKE_TEST_PLAN_MD = `## Scenario: Successful login

## Test Steps
1. Navigate to the login page
2. Enter valid email and password
3. Submit the form

## Expected Results
User is redirected to dashboard. Response includes JWT token.

## Edge Cases
- Empty credentials should return 400
- Invalid password should return 401

## Risk Areas
- Token expiry handling
- Concurrent session management
`;

export const FAKE_INFRA_DELTA_BYPASS = {
  needs_infra_change: false,
  rationale: "The story only adds an endpoint on the existing FastAPI service — the current pipeline covers it.",
  deltas: [],
};

export const FAKE_INFRA_DELTA_CHANGES = {
  needs_infra_change: true,
  rationale: "Login token issuance requires a JWT signing secret in the backend environment.",
  deltas: [
    {
      category: "secret",
      title: "Provision JWT signing secret",
      detail: "Add JWT_SECRET to the backend container environment and the deployment workflow.",
      risk: "high",
    },
  ],
};

export const FAKE_DEPLOY_PACK_MD = `## Provision JWT signing secret

**Category:** secret · **Risk:** high

### Change
Add JWT_SECRET to the backend environment.

### Script
\`\`\`env
JWT_SECRET=<generate-256-bit>
\`\`\`

### Verification
1. Boot the backend and confirm /auth/login issues tokens.

## Rollback Plan
1. Remove JWT_SECRET from the environment.
`;

const FAKE_BUG_REPORT_MD = `## Bug Summary
Login endpoint returns 500 on valid credentials.

## Failed Scenario
Successful login

## Root Cause Hypothesis
Unhandled exception in password hashing comparison.

## Patch Scope
backend/app/api/auth.py — validate_credentials()

## Reproduction Steps
1. POST /auth/login with valid credentials
2. Observe 500 response

## Fix-Bolt Brief
Task: Fix validate_credentials() to handle bcrypt exceptions.
Files: backend/app/api/auth.py
Verify: POST /auth/login returns 200 with JWT token
Done-when: login test passes
`;

const FAKE_PACK_MD = `## Context
Implement login endpoint for the authentication feature.

## Implementation Steps
1. Create the FastAPI route
2. Add JWT token generation
3. Write unit tests

## Files to Change
- backend/app/api/auth.py
- backend/tests/test_auth.py

## Test Assertions
- POST /auth/login returns 200 with token
- Invalid credentials return 401

## Agentic Brief
Task: Implement POST /auth/login
Files: backend/app/api/auth.py
Verify: POST /auth/login returns JWT token
Constraints: Use existing User model
Done-when: login endpoint passes all tests

## Chat Prompt
You are implementing a login endpoint. The endpoint should accept email and password, validate credentials, and return a JWT token.
`;

const FAKE_TASKS = [
  {
    id: 1,
    subject: "Create User model and migration",
    description: "Define SQLAlchemy User model with email and hashed password fields.",
    effort_estimate: "S",
    covered_scenarios: ["Successful login"],
    predecessor_task_ids: [],
    taiga_task_id: null,
  },
  {
    id: 2,
    subject: "Implement POST /auth/login endpoint",
    description: "Validate credentials and return JWT token.",
    effort_estimate: "M",
    covered_scenarios: ["Successful login"],
    predecessor_task_ids: [1],
    taiga_task_id: null,
  },
];

const FAKE_STORY_CONTEXT = {
  story_id: 10,
  title: "User Login",
  epic_title: "Authentication",
  gherkin:
    "Feature: User Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token",
  technical_spec: "## Endpoints\n- POST /auth/login · auth:none · in:{email,password} · out:{token}",
  project_concept: "Authentication service for a web application.",
  tech_stack: "FastAPI + Next.js + PostgreSQL",
  design_bundle: "## UX Brief\n- Login screen\n## Endpoints\n- POST /auth/login\n## Data Model\n### User",
};

const FAKE_NL_DRAFT =
  "1. As a registered user, I want to log in with my email and password so I can access the system.\n\n2. As a user, I want to reset my password via email so I can regain access if I forget it.";

const FAKE_COMPILED_STORIES = [
  {
    title: "User Login",
    size: "M",
    gherkin:
      "Feature: User Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token",
  },
  {
    title: "Password Reset",
    size: "S",
    gherkin:
      "Feature: Password Reset\n  Scenario: Reset via email\n    Given a registered user\n    When they request a reset link\n    Then they receive an email with reset link",
  },
];

export const FAKE_ANALYTICS_SUMMARY = {
  funnel: {
    gherkin_locked: 0,
    design_locked: 0,
    implementation: 1,
    qa: 0,
    qa_passed: 1,
    deployed: 2,
  },
  cycle_times: [
    { transition: "implementation → qa", median_hours: 6.0, p90_hours: 9.0, samples: 3 },
    { transition: "qa_passed → deployed", median_hours: 2.5, p90_hours: 4.0, samples: 2 },
  ],
  traceability: { deployed: 2, complete: 1, rate: 0.5 },
  conformance: { eligible: 2, checked: 1, avg_score: 75.0 },
  defects: { total_fix_bolts: 3, stories_affected: 2, avg_per_story: 0.75 },
  stories: [
    {
      story_id: 10,
      title: "User Login",
      epic_title: "Authentication",
      phase_status: "deployed",
      fix_bolt_count: 2,
      total_cycle_hours: 48.0,
      artifact_complete: true,
      risk: { level: "high", score: 5, reasons: ["2 Fix-Bolts — defect-prone"] },
    },
    {
      story_id: 11,
      title: "Password Reset",
      epic_title: "Authentication",
      phase_status: "deployed",
      fix_bolt_count: 1,
      total_cycle_hours: 30.0,
      artifact_complete: false,
      risk: { level: "low", score: 1, reasons: ["1 Fix-Bolt logged"] },
    },
    {
      story_id: 12,
      title: "Logout",
      epic_title: "Authentication",
      phase_status: "implementation",
      fix_bolt_count: 0,
      total_cycle_hours: null,
      artifact_complete: false,
      risk: { level: "none", score: 0, reasons: [] },
    },
  ],
};

export async function applyMocks(page: Page) {
  const api = "http://localhost:8000";
  // All Taiga calls now route through the FastAPI proxy — never directly to taiga.io.
  const taiga = `${api}/api/pm/taiga`;

  // Mutable state shared between route handlers (allows stateful mock transitions).
  const mockState = { techStackDefined: false };

  // ── Health check (app-shell on mount) ─────────────────────────────────────
  await page.route(`${api}/api/health`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) }),
  );

  // ── Figma proxy (sidebar connect + design-token sync) ─────────────────────
  // One handler switches on the proxied path: file verify/fetch, comments,
  // published styles/components, node hex resolution, and image renders.
  await page.route(`${api}/api/design/figma/**`, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/comments")) return json({ comments: [] });
    if (url.includes("/styles")) {
      return json({ meta: { styles: [
        { node_id: "c1", name: "Primary/500", style_type: "FILL" },
        { node_id: "t1", name: "Heading/H1", style_type: "TEXT" },
      ] } });
    }
    if (url.includes("/components")) return json({ meta: { components: [{ name: "Button" }, { name: "Card" }] } });
    if (url.includes("/nodes")) {
      return json({ nodes: { c1: { document: { fills: [{ type: "SOLID", color: { r: 0.1, g: 0.45, b: 0.91 } }] } } } });
    }
    if (url.includes("/images")) return json({ images: {} });
    // Default: a file fetch (verify at depth=1, sync at depth=2).
    return json({
      name: "Design File",
      lastModified: "2026-06-29T00:00:00Z",
      document: { children: [
        { type: "CANVAS", name: "Page 1", children: [{ id: "1:2", name: "Login", type: "FRAME" }] },
      ] },
    });
  });

  // ── Workspace (sidebar loads these on mount) ──────────────────────────────
  // Register catch-all FIRST so specific routes registered after override it.
  // (Playwright matches last-registered handler first.)
  await page.route(`${api}/api/workspace/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route(`${api}/api/workspace/config`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ai_model: null, taiga_api_url: "https://api.taiga.io" }),
    }),
  );

  await page.route(`${api}/api/workspace/ai-config`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        available_models: [
          { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", role: "main", provider: "anthropic" },
        ],
        configured_providers: ["anthropic"],
      }),
    }),
  );

  await page.route(`${api}/api/workspace/context-files**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: [], total_chars: 0 }),
    }),
  );

  await page.route(`${api}/api/workspace/board**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  // ── Phase 4 ───────────────────────────────────────────────────────────────
  await page.route(`${api}/api/phase4/eligible-stories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stories: [
          {
            story_id: 10,
            title: "User Login",
            epic_title: "Authentication",
            gherkin_preview: "Feature: User Login\n  Scenario: Successful login",
            has_bdd: false,
            has_bug_report: false,
            is_regression_bypass: false,
          },
        ],
      }),
    }),
  );

  await page.route(`${api}/api/phase4/story-context/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_id: 10,
        title: "User Login",
        epic_title: "Authentication",
        gherkin: "Feature: User Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token",
        technical_spec: "## Endpoints\n- POST /auth/login · auth:none · in:{email,password} · out:{token}",
        tech_stack: "FastAPI + Next.js + PostgreSQL",
        task_list: [],
      }),
    }),
  );

  await page.route(`${api}/api/phase4/generate-test-plan`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, test_plan_md: FAKE_TEST_PLAN_MD }),
    }),
  );

  await page.route(`${api}/api/phase4/save-test-plan`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase4/test-plan/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, test_plan_md: "" }),
    }),
  );

  await page.route(`${api}/api/phase4/generate-bug-report`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, bug_report_md: FAKE_BUG_REPORT_MD }),
    }),
  );

  await page.route(`${api}/api/phase4/pass-gate`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase4/fail-gate`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  // ── Phase 5 ───────────────────────────────────────────────────────────────
  await page.route(`${api}/api/phase5/eligible-stories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stories: [
          {
            story_id: 10,
            title: "User Login",
            epic_title: "Authentication",
            gherkin_preview: "Feature: User Login\n  Scenario: Successful login",
            has_infra_delta: false,
            has_deploy_pack: false,
            deploy_bypass: false,
            fix_bolt_count: 0,
          },
        ],
      }),
    }),
  );

  await page.route(`${api}/api/phase5/story-context/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_id: 10,
        title: "User Login",
        epic_title: "Authentication",
        gherkin: "Feature: User Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token",
        technical_spec: "## Endpoints\n- POST /auth/login · auth:none · in:{email,password} · out:{token}",
        tech_stack: "FastAPI + Next.js + PostgreSQL",
        github_context_synced: true,
        has_bug_report: false,
        fix_bolt_count: 0,
      }),
    }),
  );

  // Default verdict: routine bypass. Specs override this route for the
  // changes-required flow (last-registered handler wins).
  await page.route(`${api}/api/phase5/generate-infra-delta`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, delta: FAKE_INFRA_DELTA_BYPASS }),
    }),
  );

  await page.route(`${api}/api/phase5/save-infra-delta`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  // No saved delta on first load — the hook treats 422 as "not yet saved".
  await page.route(`${api}/api/phase5/infra-delta/**`, (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "No infra delta saved for story 10." }),
    }),
  );

  await page.route(`${api}/api/phase5/generate-deploy-pack`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, deploy_pack_md: FAKE_DEPLOY_PACK_MD }),
    }),
  );

  await page.route(`${api}/api/phase5/save-deploy-pack`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase5/deploy-pack/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, deploy_pack_md: "" }),
    }),
  );

  await page.route(`${api}/api/phase5/revise-deploy-pack`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_id: 10,
        deploy_pack_md: `${FAKE_DEPLOY_PACK_MD}\n\n## Revision Notes\nSecret rotation added per security review.`,
      }),
    }),
  );

  await page.route(`${api}/api/phase5/pass-deployment-gate`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase5/qa-results/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_id: 10,
        qa_results: {
          story_id: 10,
          attempts: [{
            recorded_at: "2026-06-12T00:00:00+00:00",
            gate: "pass",
            results: [{ scenario: "Successful login", result: "pass", notes: "" }],
          }],
        },
      }),
    }),
  );

  await page.route(`${api}/api/phase5/save-verification`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase5/verification/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, matrix: null }),
    }),
  );

  // ── Phase 3 ───────────────────────────────────────────────────────────────
  await page.route(`${api}/api/phase3/eligible-stories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stories: [
          {
            story_id: 10,
            title: "User Login",
            epic_title: "Authentication",
            gherkin_preview: "Feature: User Login\n  Scenario: Successful login",
            tech_spec_preview: "POST /auth/login",
          },
        ],
      }),
    }),
  );

  await page.route(`${api}/api/phase3/story-context/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_STORY_CONTEXT),
    }),
  );

  await page.route(`${api}/api/phase3/generate-tasks`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, tasks: FAKE_TASKS }),
    }),
  );

  await page.route(`${api}/api/phase3/generate-proposal`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ proposal_md: FAKE_PACK_MD }),
    }),
  );

  await page.route(`${api}/api/phase3/save-proposal`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.route(`${api}/api/phase3/proposals/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, proposals: [] }),
    }),
  );

  await page.route(`${api}/api/phase3/lock-story`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  // ── Phase 2 ───────────────────────────────────────────────────────────────
  // Stateful: returns defined=true after lock-tech-stack is called.
  await page.route(`${api}/api/phase2/tech-stack-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        defined: mockState.techStackDefined,
        tech_stack: mockState.techStackDefined ? "FastAPI + Next.js + PostgreSQL" : null,
      }),
    }),
  );

  await page.route(`${api}/api/phase2/propose-tech-stack`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alternatives: [
          {
            name: "FastAPI + Next.js + PostgreSQL",
            description: "Python backend with React frontend and relational database.",
            trade_offs: "+ Type safety\n- Setup time",
          },
          {
            name: "Express + React + MongoDB",
            description: "JavaScript full-stack with document database.",
            trade_offs: "+ Familiar JS stack\n- Less structured",
          },
        ],
      }),
    }),
  );

  await page.route(`${api}/api/phase2/lock-tech-stack`, (route) => {
    mockState.techStackDefined = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ defined: true, tech_stack: "FastAPI + Next.js + PostgreSQL" }),
    });
  });

  await page.route(`${api}/api/phase2/generate-design-section`, async (route) => {
    const body = await route.request().postDataJSON() as { section: string };
    const content: Record<string, string> = {
      ux_brief: "## Screens\n- Login screen with email/password form\n- Dashboard after login",
      endpoints: "## Endpoints\n- POST /auth/login · in:{email,password} · out:{token}",
      data_model: "## Data Model\n### User\n- id: UUID (PK)\n- email: varchar\n- password_hash: varchar",
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        section: body.section,
        content: content[body.section] ?? "",
        story_ids: [10],
      }),
    });
  });

  await page.route(`${api}/api/phase2/persist-design`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, story_ids: [10], taiga_failures: [] }),
    }),
  );

  await page.route(`${api}/api/phase2/diagram`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  await page.route(`${api}/api/phase2/generate-diagram`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        nodes: [{ id: "user", type: "entity", position: { x: 0, y: 0 }, data: { label: "User", fields: [] } }],
        edges: [],
      }),
    }),
  );

  await page.route(`${api}/api/phase2/screen-flow`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  await page.route(`${api}/api/phase2/generate-screen-flow`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        nodes: [{ id: "login", type: "screen", position: { x: 0, y: 0 }, data: { label: "Login", description: "Login form" } }],
        edges: [],
      }),
    }),
  );

  await page.route(`${api}/api/phase2/refresh-story-index`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  // ── Analytics ─────────────────────────────────────────────────────────────
  await page.route(`${api}/api/analytics/summary`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_ANALYTICS_SUMMARY),
    }),
  );

  // ── Phase 1 ───────────────────────────────────────────────────────────────
  await page.route(`${api}/api/phase1/generate-nl-stories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nl_draft: FAKE_NL_DRAFT, story_count: 2 }),
    }),
  );

  await page.route(`${api}/api/phase1/compile-gherkin`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stories: FAKE_COMPILED_STORIES }),
    }),
  );

  await page.route(`${api}/api/phase1/finalize-stories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, epic_id: 10, count: 2, story_ids: [101, 102] }),
    }),
  );

  // ── Autopilot ─────────────────────────────────────────────────────────────
  const FAKE_JOB_ID = "e2e-fake-job-id";

  await page.route(`${api}/api/autopilot/start`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job_id: FAKE_JOB_ID }),
    }),
  );

  // Default: running state with one event. Specs can override for done/paused.
  await page.route(`${api}/api/autopilot/${FAKE_JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: FAKE_JOB_ID,
        state: "running",
        current_phase: "phase1",
        current_epic_idx: 0,
        current_story_id: null,
        events: [
          { id: 1, ts: Date.now() / 1000, level: "info", msg: "Autopilot started", phase: "init", artifact: "" },
          { id: 2, ts: Date.now() / 1000, level: "info", msg: "Phase 1 · Epic 1/1: 'User Authentication'", phase: "phase1", artifact: "" },
        ],
        error: null,
        story_count: 0,
        stories_done: 0,
        checkpoint_phase: null,
      }),
    }),
  );

  await page.route(`${api}/api/autopilot/${FAKE_JOB_ID}/pause`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "paused" }),
    }),
  );

  await page.route(`${api}/api/autopilot/${FAKE_JOB_ID}/resume`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "running" }),
    }),
  );

  await page.route(`${api}/api/autopilot/${FAKE_JOB_ID}/stop`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "stopped" }),
    }),
  );

  await page.route(`${api}/api/autopilot/${FAKE_JOB_ID}/take-over`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "stopped" }),
    }),
  );

  // ── Taiga calls via backend proxy (/api/pm/taiga/*) ──────────────────────
  const FAKE_EPIC = { id: 10, ref: 1, subject: "Authentication", description: "User auth epic", version: 1, tags: [] };
  const FAKE_STORY = { id: 101, ref: 1, subject: "User Login", description: "", version: 2, status: 1, tags: [], epic: 10, epic_extra_info: { id: 10, subject: "Authentication" } };

  await page.route(`${taiga}/users/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, username: "e2euser", full_name: "E2E User", email: "e2e@test.com" }),
    }),
  );

  await page.route(`${taiga}/memberships**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  await page.route(`${taiga}/roles**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  await page.route(`${taiga}/tasks**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  await page.route(`${taiga}/userstory-statuses**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  await page.route(`${taiga}/epics**`, (route) => {
    const url = route.request().url();
    if (url.includes("related_userstories")) {
      // POST /epics/{id}/related_userstories — epic↔story link
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    } else if (route.request().method() === "POST") {
      // POST /epics — create epic
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_EPIC) });
    } else {
      // GET /epics or /epics/{id}
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([FAKE_EPIC]) });
    }
  });

  await page.route(`${taiga}/userstories**`, (route) => {
    const method = route.request().method();
    if (method === "GET" && !route.request().url().match(/userstories\/\d+/)) {
      // GET /userstories?project=... — list stories
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else {
      // POST (create), PATCH (update status), GET /userstories/{id} (re-fetch)
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_STORY) });
    }
  });

  await page.route(`${taiga}/projects**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, slug: "test-project", name: "Test Project", description: "" }]),
    }),
  );
}

export const SESSION_STORAGE = JSON.stringify({
  state: {
    pmTool: "taiga",
    taigaToken: "fake-taiga-token-for-e2e",
    taigaApiUrl: "https://api.taiga.io/api/v1",
    jiraEmail: "",
    projectId: 1,
    projectName: "Test Project",
    pmProjectSlug: "test-project",
    // Must match taigaApiUrl or useApiContext() treats the project as a
    // cross-instance selection and returns null (no context loads).
    projectInstanceUrl: "https://api.taiga.io/api/v1",
    githubPat: "",
    githubRepo: "",
  },
  version: 6,
});

export const PHASE4_STORE_RESET = JSON.stringify({
  state: {
    selectedStoryId: null,
    testPlanMd: null,
    scenarioResults: {},
    scenarioNotes: {},
    bugReportDrafts: {},
    isRegressionBypass: false,
    failedScenarioNames: [],
    currentStoryMeta: { title: "", epicTitle: "" },
  },
  version: 0,
});

export const PHASE5_STORE_RESET = JSON.stringify({
  state: {
    selectedStoryId: null,
    currentStoryMeta: { title: "", epicTitle: "" },
    infraDelta: null,
    deltaSaved: false,
    deployPackMd: null,
    packSaved: false,
    techLeadApproved: false,
    devopsApproved: false,
  },
  version: 0,
});

// Clean phase3 store so stale tasksPushed/pushedStoryIds don't disable buttons.
export const PHASE3_STORE_RESET = JSON.stringify({
  state: {
    selectedStoryId: null,
    taskList: [],
    pmTaskIds: {},
    pmTaskRefs: {},
    tasksPushed: false,
    packDrafts: {},
    lockedTaskIds: [],
    currentStoryMeta: { title: "", epicTitle: "" },
    pushedStoryIds: [],
  },
  version: 0,
});
