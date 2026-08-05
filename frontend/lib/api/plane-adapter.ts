/**
 * Plane.so implementation of ProjectManagementAdapter.
 *
 * Read paths only — Phase 2 of the Plane integration (see
 * plane_integration_plan memory). Write paths (create/update/delete) are a
 * later phase; every method not yet implemented throws a clear
 * "not yet supported for Plane" error rather than being silently missing —
 * per the pm-adapter-sync skill's stub convention, callers get a compile-time
 * presence guarantee and a legible runtime message, not a missing method.
 */
import {
  isPlane401,
  isPlaneStateClosed,
  planeGetBoard,
  planeGetEpic,
  planeGetMe,
  planeGetStory,
  planeListProjects,
  planeListStoryStatuses,
} from "./plane-direct";
import type { PmAuthContext, PmRequestContext, ProjectManagementAdapter } from "./pm-types";

function requireWorkspaceSlug(ctx: PmAuthContext): string {
  if (!ctx.workspaceSlug) {
    throw new Error("Plane workspace slug is required — no Plane API can discover it from a key alone.");
  }
  return ctx.workspaceSlug;
}

function notSupported(action: string): never {
  throw new Error(`${action} is not yet supported for Plane (write paths land in a later phase).`);
}

const planeAdapter: ProjectManagementAdapter = {
  name: "plane",

  errMsg: (err, action = "Plane request") => {
    if (isPlane401(err)) return "Plane rejected the API key. Sign in again.";
    if (err instanceof Error) return `${action} failed: ${err.message}`;
    return `${action} failed.`;
  },
  // Plane exposes no optimistic-concurrency field on work items (confirmed —
  // see plane_integration_plan memory), so there is no 409 to detect.
  isPmVersionConflict: () => false,
  getWebUrl: (baseUrl) => {
    // Cloud: api.plane.so (API) vs app.plane.so (web UI) — different
    // subdomains, mirroring Taiga's api./tree. split. Self-hosted uses ONE
    // domain for both (confirmed — no separate API host is even possible
    // since PR makeplane/plane#2135), so anything else passes through as-is.
    // NOT live-verified against a real Plane Cloud account — flagged in the
    // plane_integration_plan memory's "Remaining unknowns" for phase 2.
    const stripped = baseUrl.replace(/\/api(?:\/v\d+)?$/, "");
    return stripped.includes("api.plane.so") ? stripped.replace("api.plane.so", "app.plane.so") : stripped;
  },

  getMe: (auth: PmAuthContext) => planeGetMe(auth.token, auth.baseUrl),

  listProjects: (auth: PmAuthContext) =>
    planeListProjects(auth.token, requireWorkspaceSlug(auth), auth.baseUrl),

  createProject: () => notSupported("Creating a project"),
  updateProject: () => notSupported("Updating a project"),
  deleteProject: () => notSupported("Deleting a project"),
  listProjectTemplates: async () => [], // confirmed: no list-templates endpoint exists on Plane at all

  getBoard: (ctx: PmRequestContext) =>
    planeGetBoard(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, ctx.baseUrl),

  getEpic: (ctx: PmRequestContext, epicId: string) =>
    planeGetEpic(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, epicId, ctx.baseUrl),

  createEpic: () => notSupported("Creating an epic"),
  updateEpic: () => notSupported("Updating an epic"),
  deleteEpic: () => notSupported("Deleting an epic"),

  getStory: (ctx: PmRequestContext, storyId: string) =>
    planeGetStory(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, storyId, ctx.baseUrl),

  createStory: () => notSupported("Creating a story"),
  updateStory: () => notSupported("Updating a story"),
  deleteStory: () => notSupported("Deleting a story"),

  listStoryStatuses: async (ctx: PmRequestContext) => {
    const statuses = await planeListStoryStatuses(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, ctx.baseUrl);
    return statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, is_closed: isPlaneStateClosed(s.group) }));
  },

  getUsers: () => notSupported("Listing members"),
  inviteUser: () => notSupported("Inviting a member"),
  removeMember: () => notSupported("Removing a member"),
  updateMemberRole: () => notSupported("Updating a member's role"),

  getProjectTasks: () => notSupported("Listing tasks"),
  getTask: () => notSupported("Fetching a task"),
  createTask: () => notSupported("Creating a task"),
  updateTask: () => notSupported("Updating a task"),
  deleteTask: () => notSupported("Deleting a task"),
};

export { planeAdapter };
