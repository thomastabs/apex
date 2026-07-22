import { test, expect } from "./fixtures";

const STORY_CARD = /US#10.*User Login/;
const API = "http://localhost:8000";

/** Sonner toasts overlay the bottom action row; force-clicks land on the toast
 *  instead of the button. Wait for them to auto-dismiss before clicking. */
async function waitForToastsGone(page: import("@playwright/test").Page) {
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

test("Phase 5: dispatch a GitHub Actions deployment workflow after sign-off", async ({ page }) => {
  // Dispatch gates on window.confirm() ("This can deploy real infrastructure").
  page.on("dialog", (d) => d.accept());

  let dispatched = false;
  await page.route(`${API}/api/phase5/github-deployment/status**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        github_connected: true,
        repo: "acme/apex-demo",
        config: { workflow_id: ".github/workflows/deploy.yml", ref: "main", environment: "production", inputs: {}, include_apex_inputs: false },
        workflow_configured: true,
        workflow_exists: true,
        workflow: { id: 123, name: "Deploy", path: ".github/workflows/deploy.yml" },
        workflows: [{ id: 123, name: "Deploy", path: ".github/workflows/deploy.yml" }],
        latest_run: dispatched
          ? { status: "completed", conclusion: "success", run_url: "https://github.com/acme/apex-demo/actions/runs/999", run_id: 999 }
          : null,
        error: "",
      }),
    }),
  );

  await page.route(`${API}/api/phase5/github-deployment/dispatch`, (route) => {
    dispatched = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_id: 10,
        deployment: { status: "queued", run_id: 999, run_url: "https://github.com/acme/apex-demo/actions/runs/999" },
      }),
    });
  });

  await page.goto("/phase5");

  // Reach Stage D via the routine (bypass) path, same as the manual-deploy flow.
  await expect(page.getByRole("button", { name: STORY_CARD })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: STORY_CARD }).click();

  await expect(page.getByRole("heading", { name: /Pre-Flight/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Run Infra Delta Check/i }).click();
  await expect(page.getByText(/current pipeline covers it/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Save & Continue/i }).click();
  await expect(page.getByRole("heading", { name: /Routine Deployment/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Continue to Deployment Gate/i }).click();
  await expect(page.getByRole("heading", { name: "Deployment Gate", exact: true })).toBeVisible({ timeout: 10_000 });

  // GitHub Actions panel — connected + workflow configured → Ready
  await expect(page.getByText(/GitHub Actions Deployment/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Dispatch stays disabled until both sign-offs are checked.
  const dispatchBtn = page.getByRole("button", { name: /Dispatch workflow/i });
  await expect(dispatchBtn).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await expect(dispatchBtn).toBeEnabled();

  await waitForToastsGone(page);
  await dispatchBtn.click();
  await expect(page.getByText(/GitHub Actions deployment dispatched/i)).toBeVisible({ timeout: 10_000 });

  // Status query refetches after dispatch and now shows the completed run + link.
  await expect(page.getByRole("link", { name: /Open run/i })).toBeVisible({ timeout: 10_000 });
});
