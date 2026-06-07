import { test, expect } from "./fixtures";

test("Phase 2: propose architecture → save tech stack → generate design → lock design", async ({ page }) => {
  await page.goto("/phase2");

  // Stage A — tech stack not yet defined, "Propose Architecture" button visible
  await expect(page.getByRole("button", { name: /Propose Architecture/i })).toBeVisible({ timeout: 10_000 });

  // Click "Propose Architecture"
  await page.getByRole("button", { name: /Propose Architecture/i }).click();

  // Two alternatives should appear
  await expect(page.getByText("Option 1: FastAPI + Next.js + PostgreSQL")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Option 2: Express + React + MongoDB")).toBeVisible();

  // Click the first alternative card to select it
  await page.getByText("Option 1: FastAPI + Next.js + PostgreSQL").click();

  // Click "Save Technology Choices"
  await page.getByRole("button", { name: /Save Technology Choices/i }).click();

  // Success toast
  await expect(page.getByText(/Technology choices saved/i)).toBeVisible({ timeout: 5_000 });

  // Stage B appears after the status query refetches and returns defined=true.
  // The mock is stateful: lock-tech-stack handler sets techStackDefined=true.
  await expect(page.getByRole("button", { name: /Generate Design/i })).toBeVisible({ timeout: 15_000 });

  // Click "Generate Design"
  await page.getByRole("button", { name: /Generate Design/i }).click();

  // Design sections should populate — look for UX Brief content
  await expect(page.getByText(/Login screen/i)).toBeVisible({ timeout: 15_000 });

  // Wait for generation to finish and sign-off section to appear.
  // Both checkboxes must be checked before "Save & Lock Design" is enabled.
  await expect(page.getByText(/Design Lead Sign-off/i)).toBeVisible({ timeout: 15_000 });
  await page.getByText(/Design Lead Sign-off/i).click();
  await page.getByText(/Tech Lead Sign-off/i).click();

  // Click "Save & Lock Design"
  await page.getByRole("button", { name: /Save & Lock Design/i }).click();

  // Toast: "Design locked for N stories" — first() disambiguates toast vs callout
  await expect(page.getByText(/Design locked for/i).first()).toBeVisible({ timeout: 5_000 });
});
