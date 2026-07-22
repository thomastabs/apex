import { test, expect } from "./fixtures";

const API = "http://localhost:8000";

test("Context sidebar: publish context files to Taiga Wiki, then pull them back", async ({ page }) => {
  const state = {
    files: [
      { filename: "project-concept.md", label: "Project Concept", content: "Authentication service for a web application.", chars: 47, last_modified: null as string | null, version: "1.0.0", source: "apex" as const, is_custom: false },
    ],
    wikiExists: false,
  };

  await page.route(`${API}/api/workspace/context-files`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: state.files, total_chars: state.files.reduce((n, f) => n + f.chars, 0) }),
    }),
  );

  await page.route(`${API}/api/workspace/context-files/wiki-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pages: state.files.map((f) => ({
          filename: f.filename,
          label: f.label,
          slug: `apex-${f.filename.replace(/\.md$/, "")}`,
          title: `Apex - ${f.label}`,
          exists: state.wikiExists,
          wiki_id: state.wikiExists ? 1 : null,
          chars: state.wikiExists ? f.chars : 0,
          last_modified: state.wikiExists ? "2026-07-01T00:00:00Z" : null,
          source: "apex",
          is_custom: false,
        })),
      }),
    }),
  );

  await page.route(`${API}/api/workspace/context-files/wiki/publish`, (route) => {
    state.wikiExists = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        results: state.files.map((f) => ({ filename: f.filename, slug: `apex-${f.filename.replace(/\.md$/, "")}`, action: "created", ok: true, detail: "" })),
        files: state.files,
        total_chars: state.files.reduce((n, f) => n + f.chars, 0),
      }),
    });
  });

  await page.route(`${API}/api/workspace/context-files/wiki/pull`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        results: state.files.map((f) => ({ filename: f.filename, slug: `apex-${f.filename.replace(/\.md$/, "")}`, action: "pulled", ok: true, detail: "" })),
        files: state.files,
        total_chars: state.files.reduce((n, f) => n + f.chars, 0),
      }),
    }),
  );

  await page.goto("/phase1");

  await page.getByRole("button", { name: /Active Context/i }).click();
  await expect(page.getByText(/Taiga Wiki/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("0/1 pages")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Publish to Wiki/i }).click();
  await expect(page.getByText(/published to Taiga Wiki/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("1/1 pages")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Pull from Wiki/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/pulled from Taiga Wiki/i)).toBeVisible({ timeout: 10_000 });
});
