/**
 * Plane.so implementation of ProjectManagementAdapter.
 *
 * Read + write paths for epic/story/task (phases 2-3), project-scoped
 * members/roles (phase 4d), Project CRUD (phase 5h) — see
 * plane_integration_plan memory.
 */
import {
  isPlane401,
  isPlaneStateClosed,
  planeCreateEpic,
  planeCreateProject,
  planeCreateStory,
  planeCreateTask,
  planeDeleteEpic,
  planeDeleteProject,
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
  planeUpdateProject,
  planeUpdateStory,
  planeUpdateTask,
} from "./plane-direct";
import { planeWebBaseUrl } from "./plane-web-url";
import type { CreateProjectOptions, PmAuthContext, PmRequestContext, ProjectManagementAdapter } from "./pm-types";

function requireWorkspaceSlug(ctx: PmAuthContext): string {
  if (!ctx.workspaceSlug) {
    throw new Error("Plane workspace slug is required — no Plane API can discover it from a key alone.");
  }
  return ctx.workspaceSlug;
}

function notSupported(action: string): never {
  throw new Error(`${action} is not yet supported for Plane.`);
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
  // CONFIRMED CORRECT against Plane's actual frontend source and docs
  // (phase 5d, see plane_integration_plan memory) — no longer an unverified
  // guess as earlier phases had flagged it. See plane-web-url.ts for the
  // shared swap logic (also used by the per-task/story deep-link builders).
  getWebUrl: planeWebBaseUrl,

  getMe: (auth: PmAuthContext) => planeGetMe(auth.token, auth.baseUrl),

  listProjects: (auth: PmAuthContext) =>
    planeListProjects(auth.token, requireWorkspaceSlug(auth), auth.baseUrl),

  // identifier is REQUIRED by Plane's create-project endpoint (no server-derived
  // slug the way Taiga has) — opts.identifier must be supplied by the caller
  // (project-section.tsx's create dialog, gated on pmTool === "plane"); a
  // missing one fails loudly rather than silently omitting the field.
  createProject: (auth: PmAuthContext, name: string, description: string, opts?: CreateProjectOptions) => {
    if (!opts?.identifier) return notSupported("Creating a Plane project without an identifier");
    return planeCreateProject(auth.token, requireWorkspaceSlug(auth), name, description, opts.identifier, auth.baseUrl);
  },
  updateProject: (auth: PmAuthContext, projectId: string, fields: { name?: string; description?: string }) =>
    planeUpdateProject(auth.token, requireWorkspaceSlug(auth), projectId, fields, auth.baseUrl),
  deleteProject: (auth: PmAuthContext, projectId: string) =>
    planeDeleteProject(auth.token, requireWorkspaceSlug(auth), projectId, auth.baseUrl),
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

  inviteUser: (ctx: PmRequestContext, usernameOrEmail: string, roleId: string): Promise<{ scope: "project" | "workspace" }> =>
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
