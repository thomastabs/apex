/**
 * Plane.so implementation of ProjectManagementAdapter.
 *
 * Read + write paths for epic/story/task (phases 2-3), project-scoped
 * members/roles (phase 4d) — see plane_integration_plan memory. Project CRUD
 * is still unimplemented (createProject/updateProject/deleteProject) — every
 * such method throws a clear "not yet supported for Plane" error rather than
 * being silently missing, per the pm-adapter-sync skill's stub convention:
 * callers get a compile-time presence guarantee and a legible runtime
 * message, not a missing method.
 */
import {
  isPlane401,
  isPlaneStateClosed,
  planeCreateEpic,
  planeCreateStory,
  planeCreateTask,
  planeDeleteEpic,
  planeDeleteStory,
  planeDeleteTask,
  planeGetBoard,
  planeGetEpic,
  planeGetMe,
  planeGetProjectTasks,
  planeGetStory,
  planeGetTask,
  planeGetUsers,
  planeInviteUser,
  planeListProjects,
  planeListStoryStatuses,
  planeRemoveMember,
  planeUpdateEpic,
  planeUpdateMemberRole,
  planeUpdateStory,
  planeUpdateTask,
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

  createEpic: (ctx: PmRequestContext, subject: string, description: string, tags: string[]) =>
    planeCreateEpic(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, subject, description, tags, ctx.baseUrl),

  // version is a documented no-op for Plane — no optimistic-concurrency field
  // exists on work items/epics/modules (confirmed, see plane_integration_plan).
  updateEpic: (ctx: PmRequestContext, epicId: string, _version: string | number, fields) =>
    planeUpdateEpic(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, epicId, fields, ctx.baseUrl),

  deleteEpic: (ctx: PmRequestContext, epicId: string) =>
    planeDeleteEpic(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, epicId, ctx.baseUrl),

  getStory: (ctx: PmRequestContext, storyId: string) =>
    planeGetStory(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, storyId, ctx.baseUrl),

  createStory: (ctx: PmRequestContext, epicId: string, subject: string, description: string, tags: string[], statusId?: string) =>
    planeCreateStory(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, epicId, subject, description, tags, statusId, ctx.baseUrl),

  updateStory: (ctx: PmRequestContext, storyId: string, _version: string | number, fields) =>
    planeUpdateStory(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, storyId, fields, ctx.baseUrl),

  deleteStory: (ctx: PmRequestContext, storyId: string) =>
    planeDeleteStory(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, storyId, ctx.baseUrl),

  listStoryStatuses: async (ctx: PmRequestContext) => {
    const statuses = await planeListStoryStatuses(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, ctx.baseUrl);
    return statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, is_closed: isPlaneStateClosed(s.group) }));
  },

  getUsers: async (ctx: PmRequestContext) => {
    const result = await planeGetUsers(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, ctx.baseUrl);
    return { memberships: result.memberships, roles: result.roles.map((r) => ({ id: String(r.id), name: r.name })) };
  },

  inviteUser: (ctx: PmRequestContext, usernameOrEmail: string, roleId: string) =>
    planeInviteUser(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, usernameOrEmail, Number(roleId), ctx.baseUrl),

  removeMember: (ctx: PmRequestContext, membershipId: string) =>
    planeRemoveMember(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, membershipId, ctx.baseUrl),

  updateMemberRole: (ctx: PmRequestContext, membershipId: string, roleId: string) =>
    planeUpdateMemberRole(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, membershipId, Number(roleId), ctx.baseUrl),

  getProjectTasks: (ctx: PmRequestContext) =>
    planeGetProjectTasks(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, ctx.baseUrl),

  getTask: (ctx: PmRequestContext, taskId: string) =>
    planeGetTask(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, taskId, ctx.baseUrl),

  createTask: (ctx: PmRequestContext, storyId: string, subject: string, description: string, points?: number) =>
    planeCreateTask(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, storyId, subject, description, ctx.baseUrl, points),

  updateTask: (ctx: PmRequestContext, taskId: string, _version: string | number, updates: { subject?: string; description?: string }) =>
    planeUpdateTask(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, taskId, updates, ctx.baseUrl),

  deleteTask: (ctx: PmRequestContext, taskId: string) =>
    planeDeleteTask(ctx.token, requireWorkspaceSlug(ctx), ctx.projectId, taskId, ctx.baseUrl),
};

export { planeAdapter };
