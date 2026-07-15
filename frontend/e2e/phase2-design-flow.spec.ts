import { test, expect } from "./fixtures";

test("Phase 2: propose architecture → save tech stack → generate design → lock design", async ({ page }) => {
  await page.goto("/phase2");

  // Step 1 — tech stack not yet defined, "Propose Architecture" button visible
  await expect(page.getByRole("button", { name: /Propose Architecture/i })).toBeVisible({ timeout: 10_000 });

  // Click "Propose Architecture"
  await page.getByRole("button", { name: /Propose Architecture/i }).click();

  // Two alternatives should appear
  await expect(page.getByText("Option 1: FastAPI + Next.js + PostgreSQL")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Option 2: Express + React + MongoDB")).toBeVisible();

  // Click the first alternative card to select it
  await page.getByText("Option 1: FastAPI + Next.js + PostgreSQL").click();

  // Click "Save Technology Choices" — auto-advances to Step 2 (Visual Design)
  await page.getByRole("button", { name: /Save Technology Choices/i }).click();

  // Step 2 — Visual Design: only UX Brief + Visual Design System live here,
  // Technical Design (Endpoints/Data Model/Runtime) must NOT be on this step.
  await expect(page.getByRole("heading", { name: /Visual Design/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Generate Design", exact: true })).toBeVisible();
  await expect(page.getByText("Endpoints", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Runtime Contract", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: "test-results/phase2-step2-visual-design.png", fullPage: true });

  // Click "Generate Design" — cascades all four sections in the background
  await page.getByRole("button", { name: "Generate Design", exact: true }).click();

  // UX Brief card on THIS step reaches "Generated" once its section completes.
  await expect(page.getByText("Generated", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/phase2-step2-generated.png", fullPage: true });

  // Continue to Step 3 — Technical Design
  await page.getByRole("button", { name: /Continue to Technical Design/i }).click();
  await expect(page.getByRole("heading", { name: /Technical Design/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Visual Design System", { exact: true })).not.toBeVisible();

  // Wait for the Save & Lock Design button (only on this step now) to enable
  // once every section — including the mandatory Runtime Contract — has content.
  const lockButton = page.getByRole("button", { name: /Save & Lock Design/i });
  await expect(lockButton).toBeVisible({ timeout: 15_000 });
  await expect(lockButton).toBeEnabled({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/phase2-step3-technical-design.png", fullPage: true });

  // Click "Save & Lock Design"
  await lockButton.click();

  // Toast: "Design locked for N stories" — first() disambiguates toast vs callout
  await expect(page.getByText(/Design locked for/i).first()).toBeVisible({ timeout: 5_000 });

  // "Continue to Phase 3" appears once locked, still on this step.
  await expect(page.getByRole("button", { name: /Continue to Phase 3/i })).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: "test-results/phase2-step3-locked.png", fullPage: true });
});
