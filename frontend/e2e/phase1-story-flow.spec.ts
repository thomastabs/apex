import { test, expect } from "./fixtures";

test("Phase 1: generate NL stories → convert to Gherkin → push to PM", async ({ page }) => {
  await page.goto("/phase1");

  // Default mode is "Create New" — fill in the epic title.
  await page.getByPlaceholder("e.g. User Authentication").fill("User Authentication");

  // Click "Generate Stories"
  await page.getByRole("button", { name: /Generate Stories/i }).click();

  // "Convert to Acceptance Criteria" button only appears when nlDraft is truthy.
  // Wait for it to be enabled (confirms generation succeeded AND context is available).
  const convertBtn = page.getByRole("button", { name: /Convert to Acceptance Criteria/i });
  await expect(convertBtn).toBeEnabled({ timeout: 10_000 });
  await convertBtn.click();

  // "Push Stories" becomes enabled once compiledStories is non-empty.
  // This confirms the compile mutation succeeded.
  const pushBtn = page.getByRole("button", { name: /Push Stories/i });
  await expect(pushBtn).toBeEnabled({ timeout: 10_000 });

  // Gherkin textareas have rows=10; the first should contain "Feature: User Login".
  await expect(page.locator("textarea[rows='10']").first()).toContainText("Feature: User Login");

  await pushBtn.click({ force: true });

  // Callout: "2 stories pushed and locked in the functional spec."
  await expect(page.getByText(/stories pushed and locked/i)).toBeVisible({ timeout: 10_000 });
});
