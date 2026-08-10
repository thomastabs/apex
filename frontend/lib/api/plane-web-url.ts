/**
 * Plane.so web-UI URL helpers — extracted (phase 5d, see plane_integration_plan
 * memory) so the api.plane.so -> app.plane.so swap and the work-item deep-link
 * shape are each written exactly once, shared by plane-adapter.ts's getWebUrl
 * and the per-task/story deep-link builders in use-phase3.ts/phase1.ts.
 */

/** Cloud: api.plane.so (API) vs app.plane.so (web UI) — different subdomains,
 *  mirroring Taiga's api./tree. split. Self-hosted uses ONE domain for both
 *  (confirmed — no separate API host is even possible, see makeplane/plane
 *  PR #2135), so anything else passes through as-is. CONFIRMED correct
 *  against Plane's actual frontend source and its own docs (phase 5d) — no
 *  longer an unverified guess. */
export function planeWebBaseUrl(apiBaseUrl: string): string {
  const stripped = apiBaseUrl.replace(/\/api(?:\/v\d+)?$/, "");
  return stripped.includes("api.plane.so") ? stripped.replace("api.plane.so", "app.plane.so") : stripped;
}

/** Deep link to a work item (story) or epic in Plane's web UI:
 *  `{workspaceSlug}/browse/{projectIdentifier}-{sequenceId}` — confirmed
 *  against Plane's own frontend source (phase 5d, see plane_integration_plan
 *  memory: apps/web/app/(all)/[workspaceSlug]/(projects)/browse/[workItem]/
 *  page.tsx parses `workItem.split("-")` into exactly this pair, and the same
 *  page branches on `issue?.is_epic`, confirming epics resolve through this
 *  same route rather than a separate one). */
export function planeWorkItemWebUrl(
  apiBaseUrl: string, workspaceSlug: string, projectIdentifier: string, sequenceId: string | number,
): string {
  const webBase = planeWebBaseUrl(apiBaseUrl);
  return `${webBase}/${workspaceSlug}/browse/${projectIdentifier}-${sequenceId}`;
}
