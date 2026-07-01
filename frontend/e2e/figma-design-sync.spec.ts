import { test, expect } from "./fixtures";

// End-to-end: connect a Figma file from the Settings modal, then sync its design
// context. Exercises the #1 design-token path through the proxy (file + comments +
// styles + components + nodes) — the same calls extractDesignTokens makes — and
// asserts the connect/sync happy path the user sees. Figma config lives only in
// Settings now (not the sidebar) — see sidebar.tsx TaigaSections.
test("Figma settings: connect a file then sync design-system context", async ({ page }) => {
  await page.goto("/phase2");

  // Open Settings, then the collapsed Figma panel inside it.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const figmaHeader = page.getByRole("button", { name: "Figma", exact: true });
  await expect(figmaHeader).toBeVisible({ timeout: 10_000 });
  await figmaHeader.click();

  // Fill the connect form (file URL + personal access token) and connect.
  await page.getByPlaceholder(/figma\.com\/design/i).fill("https://www.figma.com/design/ABC123/Demo");
  await page.getByPlaceholder("figd_…").fill("figd_e2e-token");
  await page.getByRole("button", { name: /Connect Figma/i }).click();

  // Connection confirmed (mock file name).
  await expect(page.getByText(/Connected to Design File/i)).toBeVisible({ timeout: 10_000 });

  // Sync the design context — pulls file + comments + published styles/components +
  // node hex (design tokens) and writes figma-context.md.
  const syncBtn = page.getByRole("button", { name: /Sync Context/i });
  await expect(syncBtn).toBeEnabled({ timeout: 10_000 });
  await syncBtn.click();

  await expect(page.getByText(/Figma context synced/i)).toBeVisible({ timeout: 10_000 });
});
