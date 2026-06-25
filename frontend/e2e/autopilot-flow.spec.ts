import { test, expect } from "./fixtures";

const API = "http://localhost:8000";
const FAKE_JOB_ID = "e2e-fake-job-id";

// ---------------------------------------------------------------------------
// Test 1: Setup form → launch → running view visible
// ---------------------------------------------------------------------------

test("Autopilot: setup form renders and launching shows running view", async ({ page }) => {
  await page.goto("/autopilot");

  // Page heading is visible
  await expect(page.getByRole("heading", { name: /Autopilot/i }).first()).toBeVisible();

  // Setup form visible — fill concept
  const conceptArea = page.locator("textarea").first();
  await conceptArea.fill("An authentication service for a web application");

  // Fill the first epic title
  await page.locator("input[placeholder*='Epic title']").first().fill("User Authentication");

  // Launch Autopilot button is enabled after filling required fields
  const launchBtn = page.getByRole("button", { name: /Launch Autopilot/i });
  await expect(launchBtn).toBeEnabled();

  // Click launch — POST /api/autopilot/start is mocked in handlers.ts
  await launchBtn.click();

  // Running view should appear with "Autopilot running" heading
  await expect(page.getByRole("heading", { name: /Autopilot running/i })).toBeVisible({ timeout: 10_000 });

  // Phase stepper shows Requirements phase (appears in sidebar nav AND stepper — pick first)
  await expect(page.getByText("Requirements").first()).toBeVisible();

  // Event log shows first event
  await expect(page.getByText(/Autopilot started/i)).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Test 2: Done state → completion banner visible
// ---------------------------------------------------------------------------

test("Autopilot: done state shows completion banner and New run button", async ({ page }) => {
  // Override the job status to return "done"
  await page.route(`${API}/api/autopilot/${FAKE_JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: FAKE_JOB_ID,
        state: "done",
        current_phase: "done",
        current_epic_idx: null,
        current_story_id: null,
        events: [
          { id: 1, ts: Date.now() / 1000, level: "success", msg: "Autopilot complete — 3 stories through full SDLC pipeline", phase: "done", artifact: "" },
        ],
        error: null,
        story_count: 3,
        stories_done: 3,
        checkpoint_phase: null,
      }),
    }),
  );

  await page.goto("/autopilot");

  const conceptArea = page.locator("textarea").first();
  await conceptArea.fill("An auth service");
  await page.locator("input[placeholder*='Epic title']").first().fill("Auth");
  await page.getByRole("button", { name: /Launch Autopilot/i }).click();

  // Completion banner heading (exact match avoids ambiguity with event log entry)
  await expect(page.getByText("Autopilot complete", { exact: true })).toBeVisible({ timeout: 10_000 });

  // "New run" button available (isTerminal = true)
  await expect(page.getByRole("button", { name: /New run/i })).toBeVisible({ timeout: 10_000 });

  // Control buttons (Pause/Stop) not visible in terminal state
  await expect(page.getByRole("button", { name: /^Stop$/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 3: Stop button calls stop endpoint
// ---------------------------------------------------------------------------

test("Autopilot: Stop button calls the stop endpoint", async ({ page }) => {
  const stopCalls: string[] = [];
  await page.route(`${API}/api/autopilot/${FAKE_JOB_ID}/stop`, async (route) => {
    stopCalls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "stopped" }),
    });
  });

  // Also override status to return "stopped" after stop so polling stops
  let stopped = false;
  await page.route(`${API}/api/autopilot/${FAKE_JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: FAKE_JOB_ID,
        state: stopped ? "stopped" : "running",
        current_phase: "phase1",
        current_epic_idx: null,
        current_story_id: null,
        events: [
          { id: 1, ts: Date.now() / 1000, level: "info", msg: "Autopilot started", phase: "init", artifact: "" },
        ],
        error: null,
        story_count: 0,
        stories_done: 0,
        checkpoint_phase: null,
      }),
    }),
  );

  await page.goto("/autopilot");

  const conceptArea = page.locator("textarea").first();
  await conceptArea.fill("An auth service");
  await page.locator("input[placeholder*='Epic title']").first().fill("Auth");
  await page.getByRole("button", { name: /Launch Autopilot/i }).click();

  // Running view should show the Stop button
  const stopBtn = page.getByRole("button", { name: /^Stop$/i });
  await expect(stopBtn).toBeVisible({ timeout: 10_000 });

  stopped = true;
  await stopBtn.click();

  // Stop endpoint was called
  await expect.poll(() => stopCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Test 4: Paused checkpoint banner visible with Resume button
// ---------------------------------------------------------------------------

test("Autopilot: paused state shows checkpoint banner with Resume button", async ({ page }) => {
  await page.route(`${API}/api/autopilot/${FAKE_JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: FAKE_JOB_ID,
        state: "paused",
        current_phase: "phase1",
        current_epic_idx: null,
        current_story_id: null,
        events: [
          { id: 1, ts: Date.now() / 1000, level: "checkpoint", msg: "Checkpoint after Phase 1 — waiting for resume", phase: "phase1", artifact: "" },
        ],
        error: null,
        story_count: 2,
        stories_done: 0,
        checkpoint_phase: "Phase 1",
      }),
    }),
  );

  await page.goto("/autopilot");

  const conceptArea = page.locator("textarea").first();
  await conceptArea.fill("An auth service");
  await page.locator("input[placeholder*='Epic title']").first().fill("Auth");
  await page.getByRole("button", { name: /Launch Autopilot/i }).click();

  // Checkpoint banner visible
  await expect(page.getByText(/Checkpoint.*Phase 1 complete/i)).toBeVisible({ timeout: 10_000 });

  // Resume button visible in the banner
  const resumeBtn = page.getByRole("button", { name: /Resume/i }).first();
  await expect(resumeBtn).toBeVisible();

  // Click resume — POST /api/autopilot/{id}/resume is mocked
  const resumeCalls: string[] = [];
  await page.route(`${API}/api/autopilot/${FAKE_JOB_ID}/resume`, async (route) => {
    resumeCalls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: "running" }),
    });
  });

  await resumeBtn.click();
  await expect.poll(() => resumeCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Test 5: Launch button disabled until form is valid
// ---------------------------------------------------------------------------

test("Autopilot: Launch Autopilot button disabled when form is empty", async ({ page }) => {
  await page.goto("/autopilot");

  const launchBtn = page.getByRole("button", { name: /Launch Autopilot/i });
  await expect(launchBtn).toBeVisible();
  await expect(launchBtn).toBeDisabled();

  // Fill concept but no epic title → still disabled
  await page.locator("textarea").first().fill("A service");
  await expect(launchBtn).toBeDisabled();

  // Fill epic title → enabled
  await page.locator("input[placeholder*='Epic title']").first().fill("Authentication");
  await expect(launchBtn).toBeEnabled();
});

// ---------------------------------------------------------------------------
// Test 6: Add / remove epic rows
// ---------------------------------------------------------------------------

test("Autopilot: can add epic rows", async ({ page }) => {
  await page.goto("/autopilot");

  // Initially one epic row
  await expect(page.locator("input[placeholder*='Epic title']")).toHaveCount(1);

  // Add an epic → two rows
  await page.getByRole("button", { name: /Add epic/i }).click();
  await expect(page.locator("input[placeholder*='Epic title']")).toHaveCount(2);

  // Add another → three rows
  await page.getByRole("button", { name: /Add epic/i }).click();
  await expect(page.locator("input[placeholder*='Epic title']")).toHaveCount(3);

  // Launch stays disabled until at least one title is filled
  await expect(page.getByRole("button", { name: /Launch Autopilot/i })).toBeDisabled();
  await page.locator("input[placeholder*='Epic title']").first().fill("Auth");
  await page.locator("textarea").first().fill("A service");
  await expect(page.getByRole("button", { name: /Launch Autopilot/i })).toBeEnabled();
});
