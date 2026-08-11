/**
 * PM adapter abstraction implemented by taiga-adapter.ts.
 */
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

export interface PmAuthContext {
  token: string;
  baseUrl: string;
  // Plane-only: workspace slug, required to build any workspace-scoped Plane
  // path (workspaces/{slug}/projects/{id}/...). Undefined for Taiga. No Plane
  // API endpoint can discover this from a key alone (confirmed absent — see
  // plane_integration_plan memory), so it's always a user-supplied field,
  // carried here rather than folded into baseUrl to keep baseUrl a plain host.
  workspaceSlug?: string;
}

export interface PmRequestContext extends PmAuthContext {
  projectId: string;
}

export type ProjectTemplate = { id: number; slug: string; name: string };
export type CreateProjectOptions = {
  // Taiga-only.
  isPrivate?: boolean;
  templateId?: number | null;
  // Plane-only, REQUIRED there (Plane's create-project endpoint 400s without
  // it — unlike Taiga's slug, which is server-derived from the name, Plane's
  // identifier is always user-chosen; see plane_integration_plan memory).
  // Ignored for Taiga.
  identifier?: string;
};

export type PmTask = {
  id: string;
  ref: string | number;
  subject: string;
  description: string;
  version: string | number;
  user_story: string | number;
  user_story_ref: string | number;
  user_story_subject: string;
};

export type PmStoryStatus = {
  id: string;
  name: string;
  color: string;
  is_closed: boolean;
};

export interface ProjectManagementAdapter {
  readonly name: "taiga" | "plane";
  errMsg(err: unknown, action?: string): string;
  isPmVersionConflict(err: unknown): boolean;
  getWebUrl(baseUrl: string): string;

  getMe(auth: PmAuthContext): Promise<Me>;

  listProjects(auth: PmAuthContext): Promise<Project[]>;
  createProject(auth: PmAuthContext, name: string, description: string, opts?: CreateProjectOptions): Promise<Project>;
  updateProject(auth: PmAuthContext, projectId: string, fields: { name?: string; description?: string }): Promise<Project>;
  deleteProject(auth: PmAuthContext, projectId: string): Promise<{ ok: boolean }>;
  listProjectTemplates(auth: PmAuthContext): Promise<ProjectTemplate[]>;

  getBoard(ctx: PmRequestContext): Promise<EpicWithStories[]>;
  getEpic(ctx: PmRequestContext, epicId: string): Promise<Epic>;
  createEpic(ctx: PmRequestContext, subject: string, description: string, tags: string[]): Promise<Epic>;
  updateEpic(ctx: PmRequestContext, epicId: string, version: string | number, fields: { subject?: string; description?: string; tags?: string[] }): Promise<Epic>;
  deleteEpic(ctx: PmRequestContext, epicId: string): Promise<{ ok: boolean; stories_deleted: number; story_failures: Array<{ story_id: string; error: string }> }>;

  getStory(ctx: PmRequestContext, storyId: string): Promise<Story>;
  createStory(ctx: PmRequestContext, epicId: string, subject: string, description: string, tags: string[], statusId?: string): Promise<Story>;
  updateStory(ctx: PmRequestContext, storyId: string, version: string | number, fields: { subject?: string; description?: string; tags?: string[]; status?: string }): Promise<Story>;
  deleteStory(ctx: PmRequestContext, storyId: string): Promise<void>;
  listStoryStatuses(ctx: PmRequestContext): Promise<PmStoryStatus[]>;

  getUsers(ctx: PmRequestContext): Promise<{ memberships: Membership[]; roles: Array<{ id: string; name: string }> }>;
  // scope: "project" — added directly as a project member, effective immediately
  // (Taiga always; Plane when usernameOrEmail matched an existing workspace
  // member). scope: "workspace" — Plane-only: no existing workspace member
  // matched, so this fell back to Plane's Workspace Invitations API instead —
  // the person is invited to the WORKSPACE, not yet a project member, and
  // needs a second inviteUser call (which will then hit the "project" path)
  // once they accept. Plane has no single call that does both — see
  // plane_integration_plan memory / docs/plane-integration.md.
  inviteUser(ctx: PmRequestContext, usernameOrEmail: string, roleId: string): Promise<{ scope: "project" | "workspace" }>;
  removeMember(ctx: PmRequestContext, membershipId: string): Promise<void>;
  updateMemberRole(ctx: PmRequestContext, membershipId: string, roleId: string): Promise<void>;

  getProjectTasks(ctx: PmRequestContext): Promise<PmTask[]>;
  getTask(ctx: PmRequestContext, taskId: string): Promise<PmTask>;
  createTask(ctx: PmRequestContext, storyId: string, subject: string, description: string, points?: number): Promise<{ id: string; ref: string | number; subject: string }>;
  updateTask(ctx: PmRequestContext, taskId: string, version: string | number, updates: { subject?: string; description?: string }): Promise<void>;
  deleteTask(ctx: PmRequestContext, taskId: string): Promise<void>;
}
