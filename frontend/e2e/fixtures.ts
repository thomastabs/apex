import { test as base, expect } from "@playwright/test";
import { applyMocks, SESSION_STORAGE, PHASE3_STORE_RESET } from "./mocks/handlers";

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject session + clean phase3 store before any navigation so Zustand
    // hydrates with a valid token + projectId, bypassing the auth UI.
    // Grant clipboard permissions so navigator.clipboard.writeText() works headless.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.addInitScript(
      ({ sessionJson, phase3Json }: { sessionJson: string; phase3Json: string }) => {
        localStorage.setItem("apex-session", sessionJson);
        localStorage.setItem("apex-phase3-draft", phase3Json);
      },
      { sessionJson: SESSION_STORAGE, phase3Json: PHASE3_STORE_RESET },
    );

    // Apply all page.route() mocks before navigating.
    await applyMocks(page);

    await use(page);
  },
});

export { expect };
