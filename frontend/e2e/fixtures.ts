import { test as base, expect } from "@playwright/test";
import {
  applyMocks,
  SESSION_STORAGE,
  PHASE3_STORE_RESET,
  PHASE4_STORE_RESET,
  PHASE5_STORE_RESET,
} from "./mocks/handlers";

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject session + clean phase stores before any navigation so Zustand
    // hydrates with a valid token + projectId, bypassing the auth UI.
    // Grant clipboard permissions so navigator.clipboard.writeText() works headless.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.addInitScript(
      ({ sessionJson, phase3Json, phase4Json, phase5Json }: { sessionJson: string; phase3Json: string; phase4Json: string; phase5Json: string }) => {
        // apex-session migrated to sessionStorage in v5 — inject there so
        // Zustand hydrates correctly in E2E tests.
        sessionStorage.setItem("apex-session", sessionJson);
        localStorage.setItem("apex-phase3-draft", phase3Json);
        localStorage.setItem("apex-phase4-draft", phase4Json);
        localStorage.setItem("apex-phase5-draft", phase5Json);
      },
      { sessionJson: SESSION_STORAGE, phase3Json: PHASE3_STORE_RESET, phase4Json: PHASE4_STORE_RESET, phase5Json: PHASE5_STORE_RESET },
    );

    // Apply all page.route() mocks before navigating.
    await applyMocks(page);

    await use(page);
  },
});

export { expect };
