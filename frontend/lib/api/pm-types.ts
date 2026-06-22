/**
 * PM adapter abstraction — types shared by taiga-adapter.ts and jira-adapter.ts.
 */
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

export interface PmAuthContext {
  token: string;
  baseUrl: string;
}

export interface PmRequestContext extends PmAuthContext {
  projectId: string;
}

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
  readonly name: "taiga" | "jira";
  errMsg(err: unknown, action?: string): string;
  isPmVersionConflict(err: unknown): boolean;
  getWebUrl(baseUrl: string): string;

  getMe(auth: PmAuthContext): Promise<Me>;

  listProjects(auth: PmAuthContext): Promise<Project[]>;
  createProject(auth: PmAuthContext, name: string, description: string): Promise<Project>;
  updateProject(auth: PmAuthContext, projectId: string, fields: { name?: string; description?: string }): Promise<Project>;
  deleteProject(auth: PmAuthContext, projectId: string): Promise<{ ok: boolean }>;

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
  inviteUser(ctx: PmRequestContext, usernameOrEmail: string, roleId: string): Promise<void>;
  removeMember(ctx: PmRequestContext, membershipId: string): Promise<void>;
  updateMemberRole(ctx: PmRequestContext, membershipId: string, roleId: string): Promise<void>;

  getProjectTasks(ctx: PmRequestContext): Promise<PmTask[]>;
  getTask(ctx: PmRequestContext, taskId: string): Promise<PmTask>;
  createTask(ctx: PmRequestContext, storyId: string, subject: string, description: string, points?: number): Promise<{ id: string; ref: string | number; subject: string }>;
  updateTask(ctx: PmRequestContext, taskId: string, version: string | number, updates: { subject?: string; description?: string }): Promise<void>;
  deleteTask(ctx: PmRequestContext, taskId: string): Promise<void>;
}
