import { test, expect } from "./fixtures";

test("Phase 1: generate NL stories → convert to Gherkin → push to PM", async ({ page }) => {
  // "Push Stories" gates on window.confirm() — auto-accept for the flow.
  page.on("dialog", (d) => d.accept());
  await page.goto("/phase1");

  // Step 1 — fill epic title, then proceed
  await page.getByPlaceholder("e.g. User Authentication").fill("User Authentication");
  await page.getByPlaceholder(/Describe the epic in detail/i).fill("Users need a secure authentication flow with login and password recovery.");
  await page.getByRole("button", { name: /Continue to Generate/i }).click();

  // Step 2 — generate stories
  await page.getByRole("button", { name: /Generate Stories/i }).click();

  // Step 3 auto-advances — "Convert to Acceptance Criteria" appears
  const convertBtn = page.getByRole("button", { name: /Convert to Acceptance Criteria/i });
  await expect(convertBtn).toBeEnabled({ timeout: 10_000 });
  await convertBtn.click();

  // Step 4 auto-advances — "Push Stories" appears
  const pushBtn = page.getByRole("button", { name: /Push Stories/i });
  await expect(pushBtn).toBeEnabled({ timeout: 10_000 });

  // Gherkin textareas have rows=10; the first should contain "Feature: User Login".
  await expect(page.locator("textarea[rows='10']").first()).toContainText("Feature: User Login");

  await pushBtn.click({ force: true });

  // Callout: "2 stories pushed and locked in the functional spec."
  await expect(page.getByText(/stories pushed and locked/i)).toBeVisible({ timeout: 10_000 });
});
