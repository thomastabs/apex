import { test, expect } from "./fixtures";
import { FAKE_INFRA_DELTA_CHANGES } from "./mocks/handlers";

const STORY_CARD = /US#10.*User Login/;
const API = "http://localhost:8000";

/** Sonner toasts overlay the bottom action row; force-clicks land on the toast
 *  instead of the button. Wait for them to auto-dismiss before clicking. */
async function waitForToastsGone(page: import("@playwright/test").Page) {
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

test("Phase 5 routine: delta check says bypass → no pack → pass deployment gate", async ({ page }) => {
  // "Approve & Deploy" gates on window.confirm() — auto-accept for the flow.
  page.on("dialog", (d) => d.accept());
  await page.goto("/phase5");

  // Stage A — story card visible
  await expect(page.getByRole("button", { name: STORY_CARD })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: STORY_CARD }).click();

  // Stage B — Pre-Flight heading
  await expect(page.getByRole("heading", { name: /Pre-Flight/i })).toBeVisible({ timeout: 10_000 });

  // Run the delta check (default mock returns the routine/bypass verdict)
  await page.getByRole("button", { name: /Run Infra Delta Check/i }).click();
  await expect(page.getByText(/current pipeline covers it/i)).toBeVisible({ timeout: 10_000 });

  // Save & Continue → Stage C bypass banner
  await page.getByRole("button", { name: /Save & Continue/i }).click();
  await expect(page.getByRole("heading", { name: /Routine Deployment/i })).toBeVisible({ timeout: 10_000 });

  // Continue to the gate
  await page.getByRole("button", { name: /Continue to Deployment Gate/i }).click();
  await expect(page.getByRole("heading", { name: "Deployment Gate", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Routine deployment \(bypass\)/i)).toBeVisible();

  // Both sign-offs required before the approve button enables
  const approveBtn = page.getByRole("button", { name: /Approve & Deploy/i });
  await expect(approveBtn).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await expect(approveBtn).toBeEnabled();

  await waitForToastsGone(page);
  await approveBtn.click();

  // Success panel
  await expect(page.getByRole("heading", { name: /Deployment Gate Passed/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Deploy Another Story/i })).toBeVisible();
});

test("Phase 5 changes: delta flags infra → deploy pack → reject/revise → pass gate", async ({ page }) => {
  // "Approve & Deploy" gates on window.confirm() — auto-accept for the flow.
  page.on("dialog", (d) => d.accept());
  // Override the default bypass verdict — last-registered route wins.
  await page.route(`${API}/api/phase5/generate-infra-delta`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ story_id: 10, delta: FAKE_INFRA_DELTA_CHANGES }),
    }),
  );

  await page.goto("/phase5");

  await expect(page.getByRole("button", { name: STORY_CARD })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: STORY_CARD }).click();

  // Stage B — run check, changes-required verdict with one delta item
  await expect(page.getByRole("heading", { name: /Pre-Flight/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Run Infra Delta Check/i }).click();
  await expect(page.locator("input[value='Provision JWT signing secret']")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Save & Continue/i }).click();

  // Stage C — generate the deploy pack
  await expect(page.getByRole("heading", { name: "Deploy Pack", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Generate Deploy Pack/i }).click();
  await expect(page.getByRole("button", { name: /Save & Continue/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Save & Continue/i }).click();

  // Stage D — pack saved, reject with security feedback
  await expect(page.getByRole("heading", { name: "Deployment Gate", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Saved and ready for review/i)).toBeVisible();

  await page.getByRole("button", { name: /Reject pack/i }).click();
  await page
    .locator("textarea[placeholder*='Security review findings']")
    .fill("Secret must be sourced from the vault, not a plain env file.");
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Send feedback & revise pack/i }).click();

  // Revision loop lands back on Stage C with the revised pack
  await expect(page.getByRole("heading", { name: "Deploy Pack", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("textarea").first()).toHaveValue(/Revision Notes/, { timeout: 10_000 });

  // Save the revised pack and pass the gate
  await page.getByRole("button", { name: /Save & Continue/i }).click();
  await expect(page.getByRole("heading", { name: "Deployment Gate", exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Approve & Deploy/i }).click();

  await expect(page.getByRole("heading", { name: /Deployment Gate Passed/i })).toBeVisible({ timeout: 10_000 });
});
