import { test, expect } from "./fixtures";

const API = "http://localhost:8000";

test("Analytics: renders governance metrics, funnel, cycle times, and per-story rows", async ({ page }) => {
  await page.goto("/analytics");

  // Metric cards — traceability rate, defect proxy, stories tracked
  await expect(page.getByText("Context Traceability Rate")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("50%")).toBeVisible();              // 1/2 deployed complete
  await expect(page.getByText("Fix-Bolts (defect proxy)")).toBeVisible();
  await expect(page.getByText("Stories tracked")).toBeVisible();

  // Funnel shows the deployed count
  await expect(page.getByRole("heading", { name: /Phase funnel/i })).toBeVisible();

  // Cycle-time table renders both transitions
  await expect(page.getByText("implementation → qa")).toBeVisible();
  await expect(page.getByText("qa_passed → deployed")).toBeVisible();

  // Per-story drill-down: deployed stories carry a complete/incomplete badge,
  // non-deployed stories show neither.
  await expect(page.getByText("User Login")).toBeVisible();
  await expect(page.getByText("complete", { exact: true })).toBeVisible();    // US#10
  await expect(page.getByText("incomplete", { exact: true })).toBeVisible();  // US#11
});

test("Analytics: CSV export triggers a download", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible({ timeout: 10_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export CSV/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("apex-analytics.csv");
});

test("Analytics: surfaces a failure callout when the summary endpoint errors", async ({ page }) => {
  // Last-registered route wins — override the default 200 with a 500.
  await page.route(`${API}/api/analytics/summary`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Analytics could not be computed: project context is unreadable or corrupt." }),
    }),
  );

  await page.goto("/analytics");
  await expect(page.getByText(/Failed to load analytics/i)).toBeVisible({ timeout: 10_000 });
});
