import { test, expect } from "./fixtures";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * The behaviour this error-surfacing pass exists for: a failing request must
 * always produce exactly one readable toast - including on code paths whose
 * hook never had an `onError` of its own.
 */

test("a failing AI call surfaces one toast carrying the server's reason", async ({ page }) => {
  await page.route(`${API}/api/phase1/generate-nl-stories`, (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ detail: { code: "ai_error", message: "The model provider is unavailable." } }),
    }),
  );

  await page.goto("/phase1");
  await page.getByPlaceholder("e.g. User Authentication").fill("User Authentication");
  await page.getByPlaceholder(/Describe the epic in detail/i).fill("Users need a secure authentication flow.");
  await page.getByRole("button", { name: /Continue to Generate/i }).click();
  await page.getByRole("button", { name: /Generate Stories/i }).click();

  const toasts = page.locator("[data-sonner-toast]");
  await expect(toasts.first()).toBeVisible({ timeout: 10_000 });
  await expect(toasts.getByText("The model provider is unavailable.")).toBeVisible();
  // Classified, so the toast also tells the user what to do next.
  await expect(toasts.getByText(/Try again shortly/i)).toBeVisible();
  // One toast, not one per handler in the chain.
  await expect(toasts).toHaveCount(1);
});

test("an AI configuration error points at Settings instead of reading as a server fault", async ({ page }) => {
  await page.route(`${API}/api/phase1/generate-nl-stories`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        detail: { code: "ai_key_rejected", message: "The AI provider rejected the API key in use." },
      }),
    }),
  );

  await page.goto("/phase1");
  await page.getByPlaceholder("e.g. User Authentication").fill("User Authentication");
  await page.getByPlaceholder(/Describe the epic in detail/i).fill("Users need a secure authentication flow.");
  await page.getByRole("button", { name: /Continue to Generate/i }).click();
  await page.getByRole("button", { name: /Generate Stories/i }).click();

  const toasts = page.locator("[data-sonner-toast]");
  await expect(toasts.first()).toBeVisible({ timeout: 10_000 });
  await expect(toasts.getByText("Story generation failed")).toBeVisible();
  await expect(toasts.getByText("The AI provider rejected the API key in use.")).toBeVisible();
  // The point of the ai_key_rejected code: a 401 that is NOT a expired session,
  // so the hint points at Settings rather than telling the user to sign in again.
  await expect(toasts.getByText(/Settings . AI Model/)).toBeVisible();
  await expect(toasts.getByText(/sign in again/i)).toHaveCount(0);
});

test("a query failure is reported even though no component renders its error", async ({ page }) => {
  await page.route(`${API}/api/workspace/context-files**`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Internal server error" }),
    }),
  );

  await page.goto("/phase1");

  // useContextFiles has no error UI at all - before the global query net this
  // failed in complete silence.
  const toasts = page.locator("[data-sonner-toast]");
  await expect(toasts.getByText("The server hit an error").first()).toBeVisible({ timeout: 15_000 });
});
