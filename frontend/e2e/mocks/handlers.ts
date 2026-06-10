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

## CLAUDE.md Snippet
### Active Task
- Implement POST /auth/login endpoint
- Files: backend/app/api/auth.py
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
    githubPat: "",
    githubRepo: "",
  },
  version: 5,
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
