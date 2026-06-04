/**
 * Taiga implementation of ProjectManagementAdapter.
 * Delegates to taiga-direct.ts, translating between string IDs (adapter interface)
 * and numeric IDs (Taiga API).
 */
import {
  isTaiga409,
  taigaCreateEpic,
  taigaCreateProject,
  taigaCreateStory,
  taigaCreateTask,
  taigaDeleteEpic,
  taigaDeleteProject,
  taigaDeleteStory,
  taigaDeleteTask,
  taigaErrMsg,
  taigaGetBoard,
  taigaGetEpic,
  taigaGetMe,
  taigaGetProject,
  taigaGetProjectTasks,
  taigaGetStory,
  taigaGetTask,
  taigaGetUsers,
  taigaInviteUser,
  taigaListProjects,
  taigaListStoryStatuses,
  taigaRemoveMember,
  taigaUpdateEpic,
  taigaUpdateMemberRole,
  taigaUpdateStory,
  taigaUpdateTask,
} from "./taiga-direct";
import type { PmAuthContext, PmRequestContext, PmTask, PmStoryStatus, ProjectManagementAdapter } from "./pm-types";
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

function n(id: string | number): number {
  return typeof id === "number" ? id : parseInt(id, 10);
}

const taigaAdapter: ProjectManagementAdapter = {
  name: "taiga",

  errMsg: (err, action) => taigaErrMsg(err, action),
  isPmVersionConflict: (err) => isTaiga409(err),
  getWebUrl: (baseUrl) => baseUrl
    .replace("//tree.", "//api.")   // normalise first so replace is idempotent
    .replace("//api.", "//tree.")   // api.taiga.io → tree.taiga.io
    .replace(/\/api(?:\/v\d+)?$/, ""), // strip /api or /api/v1 suffix

  getMe: (auth: PmAuthContext): Promise<Me> =>
    taigaGetMe(auth.token, auth.baseUrl),

  listProjects: (auth: PmAuthContext): Promise<Project[]> =>
    taigaListProjects(auth.token, auth.baseUrl),

  createProject: (auth: PmAuthContext, name: string, description: string): Promise<Project> =>
    taigaCreateProject(auth.token, name, description, auth.baseUrl),

  deleteProject: (auth: PmAuthContext, projectId: string): Promise<{ ok: boolean }> =>
    taigaDeleteProject(auth.token, n(projectId), auth.baseUrl),

  getBoard: (ctx: PmRequestContext): Promise<EpicWithStories[]> =>
    taigaGetBoard(ctx.token, n(ctx.projectId), ctx.baseUrl),

  getEpic: (ctx: PmRequestContext, epicId: string): Promise<Epic> =>
    taigaGetEpic(ctx.token, n(epicId), ctx.baseUrl),

  createEpic: (ctx: PmRequestContext, subject: string, description: string, tags: string[]): Promise<Epic> =>
    taigaCreateEpic(ctx.token, n(ctx.projectId), subject, description, tags, ctx.baseUrl),

  updateEpic: (ctx: PmRequestContext, epicId: string, version: string | number, fields: { subject?: string; description?: string; tags?: string[] }): Promise<Epic> =>
    taigaUpdateEpic(ctx.token, n(epicId), n(version), fields, ctx.baseUrl),

  deleteEpic: async (ctx: PmRequestContext, epicId: string) => {
    const result = await taigaDeleteEpic(ctx.token, n(ctx.projectId), n(epicId), ctx.baseUrl);
    return {
      ok: result.ok,
      stories_deleted: result.stories_deleted,
      story_failures: result.story_failures.map((f) => ({ story_id: String(f.story_id), error: f.error })),
    };
  },

  getStory: (ctx: PmRequestContext, storyId: string): Promise<Story> =>
    taigaGetStory(ctx.token, n(storyId), ctx.baseUrl),

  createStory: (ctx: PmRequestContext, epicId: string, subject: string, description: string, tags: string[], statusId?: string): Promise<Story> =>
    taigaCreateStory(ctx.token, n(ctx.projectId), n(epicId), subject, description, tags, statusId ? n(statusId) : undefined, ctx.baseUrl),

  updateStory: (ctx: PmRequestContext, storyId: string, version: string | number, fields: { subject?: string; description?: string; tags?: string[]; status?: string }): Promise<Story> => {
    const { status, ...rest } = fields;
    return taigaUpdateStory(ctx.token, n(storyId), n(version), { ...rest, ...(status !== undefined ? { status: n(status) } : {}) }, ctx.baseUrl);
  },

  deleteStory: (ctx: PmRequestContext, storyId: string): Promise<void> =>
    taigaDeleteStory(ctx.token, n(storyId), ctx.baseUrl),

  listStoryStatuses: async (ctx: PmRequestContext): Promise<PmStoryStatus[]> => {
    const statuses = await taigaListStoryStatuses(ctx.token, n(ctx.projectId), ctx.baseUrl);
    return statuses.map((s) => ({ id: String(s.id), name: s.name, color: s.color, is_closed: s.is_closed }));
  },

  getUsers: async (ctx: PmRequestContext) => {
    const result = await taigaGetUsers(ctx.token, n(ctx.projectId), ctx.baseUrl);
    return {
      memberships: result.memberships,
      roles: result.roles.map((r) => ({ id: String(r.id), name: r.name })),
    };
  },

  inviteUser: (ctx: PmRequestContext, usernameOrEmail: string, roleId: string): Promise<void> =>
    taigaInviteUser(ctx.token, n(ctx.projectId), usernameOrEmail, n(roleId), ctx.baseUrl),

  removeMember: (ctx: PmRequestContext, membershipId: string): Promise<void> =>
    taigaRemoveMember(ctx.token, n(membershipId), ctx.baseUrl),

  updateMemberRole: (ctx: PmRequestContext, membershipId: string, roleId: string): Promise<void> =>
    taigaUpdateMemberRole(ctx.token, n(membershipId), n(roleId), ctx.baseUrl),

  getProjectTasks: async (ctx: PmRequestContext): Promise<PmTask[]> => {
    const tasks = await taigaGetProjectTasks(ctx.token, n(ctx.projectId), ctx.baseUrl);
    return tasks.map((t) => ({
      id: String(t.id),
      ref: t.ref,
      subject: t.subject,
      description: t.description,
      version: t.version,
      user_story: t.user_story,
      user_story_ref: t.user_story_ref,
      user_story_subject: t.user_story_subject,
    }));
  },

  getTask: async (ctx: PmRequestContext, taskId: string): Promise<PmTask> => {
    const t = await taigaGetTask(ctx.token, n(taskId), ctx.baseUrl);
    return {
      id: String(t.id),
      ref: t.ref,
      subject: t.subject,
      description: t.description,
      version: t.version,
      user_story: t.user_story,
      user_story_ref: t.user_story_ref,
      user_story_subject: t.user_story_subject,
    };
  },

  createTask: async (ctx: PmRequestContext, storyId: string, subject: string, description: string, points?: number) => {
    const result = await taigaCreateTask(ctx.token, n(ctx.projectId), n(storyId), subject, description, ctx.baseUrl, points);
    return { id: String(result.id), ref: result.ref, subject: result.subject };
  },

  updateTask: (ctx: PmRequestContext, taskId: string, version: string | number, updates: { subject?: string; description?: string }): Promise<void> =>
    taigaUpdateTask(ctx.token, n(taskId), n(version), updates, ctx.baseUrl),

  deleteTask: (ctx: PmRequestContext, taskId: string): Promise<void> =>
    taigaDeleteTask(ctx.token, n(taskId), ctx.baseUrl),
};

export { taigaAdapter };
