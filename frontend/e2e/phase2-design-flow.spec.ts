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

  // Click "Save Technology Choices" — auto-advances to Step 2
  await page.getByRole("button", { name: /Save Technology Choices/i }).click();

  // Step 2 — "Generate Design" is now visible
  await expect(page.getByRole("button", { name: "Generate Design", exact: true })).toBeVisible({ timeout: 15_000 });

  // Click "Generate Design"
  await page.getByRole("button", { name: "Generate Design", exact: true }).click();

  // Design sections should populate — wait for "Continue to Sign-off" button
  await expect(page.getByRole("button", { name: /Continue to Sign-off/i })).toBeVisible({ timeout: 15_000 });

  // Proceed to Step 3
  await page.getByRole("button", { name: /Continue to Sign-off/i }).click();

  // Step 3 — sign-off section appears
  await expect(page.getByText(/Design Lead Sign-off/i)).toBeVisible({ timeout: 5_000 });
  await page.getByText(/Design Lead Sign-off/i).click();
  await page.getByText(/Tech Lead Sign-off/i).click();

  // Click "Save & Lock Design"
  await page.getByRole("button", { name: /Save & Lock Design/i }).click();

  // Toast: "Design locked for N stories" — first() disambiguates toast vs callout
  await expect(page.getByText(/Design locked for/i).first()).toBeVisible({ timeout: 5_000 });
});
