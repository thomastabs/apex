import { test, expect } from "./fixtures";

test("Phase 3: select story → generate tasks → generate pack → copy agentic brief → lock", async ({ page }) => {
  await page.goto("/phase3");

  // Stage A — story card should be visible
  await expect(page.getByText("User Login")).toBeVisible({ timeout: 10_000 });

  // Click the story card (US#10 title)
  await page.getByText("User Login").click();

  // Stage B — wait for "Generate Tasks" to be enabled (story context must load first)
  const generateTasksBtn = page.getByRole("button", { name: /Generate Tasks/i });
  await expect(generateTasksBtn).toBeEnabled({ timeout: 10_000 });
  await generateTasksBtn.click();

  // Two tasks should appear in the task list
  await expect(page.getByText("Create User model and migration")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Implement POST /auth/login endpoint")).toBeVisible();

  // Navigate to Developer Packs — scoped to main: the sidebar has a
  // "Developer Packs" section header with the same accessible name.
  await page.getByRole("main").getByRole("button", { name: "Developer Packs", exact: true }).click();

  // Stage C — click on the first task to select it, then "Generate Pack" appears.
  await page.getByText("Create User model and migration").click();

  // Stage C — click "Generate Pack" in the right-panel detail view
  await page.getByRole("button", { name: /Generate Pack/i }).click();

  // Pack preview (markdown content) should appear
  await expect(page.getByText(/Implement login endpoint/i)).toBeVisible({ timeout: 15_000 });

  // Click "Agentic Brief" copy button
  await page.getByRole("button", { name: /Agentic Brief/i }).click({ force: true });

  // Toast: "Agentic Brief copied."
  await expect(page.getByText(/Agentic Brief copied/i)).toBeVisible({ timeout: 5_000 });

  // Continue to Lock & Export
  await page.getByRole("button", { name: /Continue to Lock/i }).click();

  // Stage D — click "Lock Story"
  await page.getByRole("button", { name: /Lock Story/i }).click();

  // Success panel: "Export All Packs" button visible
  await expect(page.getByRole("button", { name: /Export All Packs/i })).toBeVisible({ timeout: 10_000 });
});
