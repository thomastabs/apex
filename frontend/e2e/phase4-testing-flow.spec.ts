import { test, expect } from "./fixtures";

// The story card is a <button> whose accessible name contains both badge and title.
const STORY_CARD = /US#10.*User Login/;

test("Phase 4 pass: select story → generate test plan → mark all pass → pass gate", async ({ page }) => {
  await page.goto("/phase4");

  // Stage A — story card visible
  await expect(page.getByRole("button", { name: STORY_CARD })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: STORY_CARD }).click();

  // Stage B — heading confirms we are in Stage B
  await expect(page.getByRole("heading", { name: /Test Plan/i })).toBeVisible({ timeout: 10_000 });

  // Generate test plan
  const generateBtn = page.getByRole("button", { name: /Generate Test Plan/i });
  await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
  await generateBtn.click();

  // "Save & Continue" appears once test plan content loads
  await expect(page.getByRole("button", { name: /Save & Continue/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Save & Continue/i }).click();

  // Stage C — wait for heading unique to Stage C
  await expect(page.getByRole("heading", { name: /Execute Tests/i })).toBeVisible({ timeout: 10_000 });

  // Scenario "Successful login" visible in checklist (Stage B is now unmounted)
  await expect(page.getByText("Successful login", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Mark the single scenario as pass
  await page.getByRole("button", { name: "Pass", exact: true }).first().click();

  // Progress counter updates
  await expect(page.getByText(/1\/1 scenarios tested/)).toBeVisible();

  // Testing Gate button becomes enabled
  const gateBtn = page.getByRole("button", { name: /Testing Gate/i });
  await expect(gateBtn).toBeEnabled({ timeout: 5_000 });
  await gateBtn.click();

  // Stage D — all passed summary
  await expect(page.getByRole("heading", { name: /Testing Gate/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/All 1 scenarios passed/i)).toBeVisible({ timeout: 10_000 });

  // Pass gate
  await page.getByRole("button", { name: /Pass Testing Gate/i }).click();

  // Success panel — use heading role to avoid matching the Sonner toast
  await expect(page.getByRole("heading", { name: /Testing Gate Passed/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/ready for production deployment/i)).toBeVisible();
});

test("Phase 4 fail: mark scenario fail → generate Fix-Bolt → trigger Fix-Bolt", async ({ page }) => {
  await page.goto("/phase4");

  await expect(page.getByRole("button", { name: STORY_CARD })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: STORY_CARD }).click();

  // Stage B
  await expect(page.getByRole("heading", { name: /Test Plan/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Generate Test Plan/i }).click();
  await expect(page.getByRole("button", { name: /Save & Continue/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Save & Continue/i }).click();

  // Stage C
  await expect(page.getByRole("heading", { name: /Execute Tests/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Successful login", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Mark as fail
  await page.getByRole("button", { name: "Fail", exact: true }).first().click();

  // Notes textarea expands — fill in QA notes
  await page.locator("textarea[placeholder*='Describe what failed']").fill("Login returns 500 instead of JWT token.");

  // Proceed to gate
  await page.getByRole("button", { name: /Testing Gate/i }).click();

  // Stage D — failure summary
  await expect(page.getByRole("heading", { name: /Testing Gate/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/1 of 1 scenarios failed/i)).toBeVisible({ timeout: 10_000 });

  // Generate Fix-Bolt artifact
  await page.getByRole("button", { name: /Generate Fix-Bolt Artifact/i }).click();

  // Bug report appears
  await expect(page.getByText(/Bug Summary/i)).toBeVisible({ timeout: 10_000 });

  // Trigger Fix-Bolt (saves to backend)
  await page.getByRole("button", { name: /Trigger Fix-Bolt/i }).click();

  // Fix-Bolt triggered panel
  await expect(page.getByText(/Fix-Bolt Triggered/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Download Fix-Bolt Artifact/i })).toBeVisible();
});
