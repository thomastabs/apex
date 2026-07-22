import { test, expect } from "./fixtures";

// Wider than the Chrome default (1280x720): at the default width, the
// right sidebar's default 420px + the button row's own width push the
// rightmost Spec Drift action buttons under the (z-20) right sidebar.
test.use({ viewport: { width: 1600, height: 900 } });

/** Sonner toasts overlay the bottom action row; force-clicks land on the toast
 *  instead of the button. Wait for them to auto-dismiss before clicking. */
async function waitForToastsGone(page: import("@playwright/test").Page) {
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

test("Phase 6 Maintenance Triage: intake → classify → diagnose → fix brief → route → resolve", async ({ page }) => {
  // Fast Lane routing and the resolve action gate on window.confirm().
  page.on("dialog", (d) => d.accept());
  await page.goto("/phase6");
  await page.waitForLoadState("networkidle");

  // Default tab is Spec Drift — switch to Feedback Routing (maintenance triage).
  await page.getByRole("tab", { name: /Feedback Routing/i }).click();
  await expect(page.getByRole("heading", { name: /Feedback Routing/i })).toBeVisible({ timeout: 10_000 });

  // Intake a new item
  await page.getByRole("button", { name: /New item/i }).click();
  await page.getByPlaceholder("Subject").fill("Login button misaligned");
  await page.getByPlaceholder(/Description/).fill("Users report the login button shifts on mobile.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Maintenance item created/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Login button misaligned").first()).toBeVisible({ timeout: 10_000 });

  // Classify (F1 triage)
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Classify \(Triage\)/i }).click();
  await expect(page.getByText(/Triage complete/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Reads as a defect report/i)).toBeVisible({ timeout: 10_000 });

  // Diagnose (Path B)
  await waitForToastsGone(page);
  await page.getByPlaceholder("Isolated code snippet").fill("if user.password_hash == hash: return user");
  await page.getByRole("button", { name: /^Diagnose/i }).click();
  await expect(page.getByText(/Diagnosis ready/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Root cause: missing null-check/i)).toBeVisible({ timeout: 10_000 });

  // Fix-Bolt brief (F2)
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Generate Fix-Bolt Brief/i }).click();
  await expect(page.getByText(/Fix-Bolt brief generated/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/add null-check to validate_credentials/i)).toBeVisible({ timeout: 10_000 });

  // Severity routing — Fast Lane
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /^Fast Lane$/i }).click();
  await expect(page.getByText(/Fast Lane — deploy record/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Routed:.*fast.*lane/i)).toBeVisible({ timeout: 10_000 });

  // Resolve (Fix Log)
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Resolve \(record fix\)/i }).click();
  await expect(page.getByText(/Resolved — fix logged/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Resolved — fix recorded in fix-log\.md/i)).toBeVisible({ timeout: 10_000 });
});

test("Phase 6 Spec Drift: verify conformance and scan for regressions", async ({ page }) => {
  await page.goto("/phase6");
  await page.waitForLoadState("networkidle");

  // Spec Drift is the default tab.
  await expect(page.getByRole("heading", { name: /Spec Drift — Code Conformance/i })).toBeVisible({ timeout: 10_000 });

  // Auto-selects the first eligible story; run the AI verify.
  await expect(page.getByText(/User Login/i).first()).toBeVisible({ timeout: 10_000 });
  await waitForToastsGone(page);
  const verifyBtn = page.getByRole("button", { name: "Verify", exact: true });
  await verifyBtn.scrollIntoViewIfNeeded();
  await verifyBtn.click();
  await expect(page.getByText(/Login endpoint matches the spec/i)).toBeVisible({ timeout: 15_000 });

  // Scan for regressions across all previously-verified stories.
  await waitForToastsGone(page);
  await page.getByRole("button", { name: /Scan for regressions/i }).click();
  await expect(page.getByText(/No regressions/i)).toBeVisible({ timeout: 15_000 });
});
