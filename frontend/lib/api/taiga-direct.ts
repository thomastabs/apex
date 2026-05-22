/**
 * Direct Taiga API calls from the browser.
 * Bypasses the FastAPI backend so Azure egress IPs are never involved.
 * All functions throw ApiError on failure for compatibility with existing hooks.
 */
import { ApiError } from "./client";
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

const DEFAULT_TAIGA_API = "https://api.taiga.io/api/v1";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export function getTaigaApiBaseUrl(input?: string) {
  const configured = input || process.env.NEXT_PUBLIC_TAIGA_API_URL || DEFAULT_TAIGA_API;
  const trimmed = configured.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed.replace("//tree.", "//api.")}/api/v1`;
}

async function taigaFetch<T>(
  path: string,
  token: string,
  apiBaseUrl?: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${getTaigaApiBaseUrl(apiBaseUrl)}${path}`;
  const res = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-disable-pagination": "True",
    },
    body: options?.body != null ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data._error_message as string) || (data.detail as string) || `Taiga error ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function parseTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags.flatMap((tag) => {
    if (Array.isArray(tag) && tag.length > 0) return [String(tag[0])];
    if (typeof tag === "string" && tag) return [tag];
    return [];
  });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function descriptionText(raw: Record<string, unknown>): string {
  const description = raw.description ?? raw.description_diff;
  if (description) return String(description);
  const html = raw.description_html;
  if (!html) return "";
  const withBreaks = String(html).replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, "")).trim();
}

async function hydrateMissingDescriptions(
  resource: "epics" | "userstories",
  rawList: Record<string, unknown>[],
  token: string,
  apiBaseUrl?: string,
) {
  return Promise.all(
    rawList.map(async (item) => {
      if (!item.id || descriptionText(item)) return item;
      try {
        return await taigaFetch<Record<string, unknown>>(`/${resource}/${item.id}`, token, apiBaseUrl);
      } catch {
        return item;
      }
    }),
  );
}

function normalizeEpic(raw: Record<string, unknown>): Epic {
  return {
    id: raw.id as number,
    ref: (raw.ref ?? raw.id) as number,
    subject: (raw.subject as string) || "",
    description: descriptionText(raw),
    version: (raw.version as number) ?? null,
    tags: parseTags(raw.tags),
  };
}

function normalizeStory(raw: Record<string, unknown>): Story {
  const epicExtraInfo = raw.epic_extra_info as Record<string, unknown> | null;
  const epicsArr = raw.epics as Record<string, unknown>[] | null;
  const epicInfo = epicExtraInfo ?? (Array.isArray(epicsArr) && epicsArr.length > 0 ? epicsArr[0] : null);
  const epicField = raw.epic as Record<string, unknown> | number | null;
  const epicId: number | null =
    typeof epicField === "number" ? epicField :
      typeof epicField === "object" && epicField != null ? (epicField.id as number) :
        epicInfo != null ? (epicInfo.id as number) : null;
  const epicSubject: string =
    epicInfo != null ? ((epicInfo.subject as string) || "") : "";

  return {
    id: raw.id as number,
    ref: (raw.ref ?? raw.id) as number,
    subject: (raw.subject as string) || "",
    description: descriptionText(raw),
    version: (raw.version as number) ?? null,
    status: (raw.status as number) ?? null,
    tags: parseTags(raw.tags),
    epic_id: epicId,
    epic_subject: epicSubject,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function taigaGetMe(token: string, apiBaseUrl?: string): Promise<Me> {
  const raw = await taigaFetch<Record<string, unknown>>("/users/me", token, apiBaseUrl);
  return {
    id: raw.id as number,
    username: (raw.username as string) || "",
    full_name: (raw.full_name as string) || "",
    email: (raw.email as string) || "",
  };
}

export async function taigaListProjects(token: string, apiBaseUrl?: string): Promise<Project[]> {
  const me = await taigaFetch<{ id: number }>("/users/me", token, apiBaseUrl);
  const raw = await taigaFetch<Record<string, unknown>[]>(
    `/projects?member=${me.id}&order_by=name`,
    token,
    apiBaseUrl,
  );
  return (raw ?? []).map((project) => ({
    id: project.id as number,
    name: (project.name as string) || "",
    slug: (project.slug as string) ?? null,
    description: descriptionText(project),
  }));
}

export async function taigaCreateProject(
  token: string,
  name: string,
  description: string,
  apiBaseUrl?: string,
): Promise<Project> {
  const raw = await taigaFetch<Record<string, unknown>>("/projects", token, apiBaseUrl, {
    method: "POST",
    body: { name, description },
  });
  return {
    id: raw.id as number,
    name: (raw.name as string) || "",
    slug: (raw.slug as string) ?? null,
    description: descriptionText(raw),
  };
}

export async function taigaDeleteProject(token: string, projectId: number, apiBaseUrl?: string): Promise<{ ok: boolean }> {
  await taigaFetch<unknown>(`/projects/${projectId}`, token, apiBaseUrl, { method: "DELETE" });
  return { ok: true };
}

export async function taigaGetBoard(token: string, projectId: number, apiBaseUrl?: string): Promise<EpicWithStories[]> {
  const [rawEpics, rawStories] = await Promise.all([
    taigaFetch<Record<string, unknown>[]>(`/epics?project=${projectId}&order_by=ref`, token, apiBaseUrl),
    taigaFetch<Record<string, unknown>[]>(`/userstories?project=${projectId}&order_by=ref`, token, apiBaseUrl),
  ]);
  const [epics, stories] = await Promise.all([
    hydrateMissingDescriptions("epics", rawEpics ?? [], token, apiBaseUrl),
    hydrateMissingDescriptions("userstories", rawStories ?? [], token, apiBaseUrl),
  ]);
  const storiesByEpic = new Map<number, Story[]>();
  for (const rawStory of stories) {
    const story = normalizeStory(rawStory);
    if (story.epic_id != null) {
      const arr = storiesByEpic.get(story.epic_id) ?? [];
      arr.push(story);
      storiesByEpic.set(story.epic_id, arr);
    }
  }
  return epics.map((rawEpic) => {
    const epic = normalizeEpic(rawEpic);
    return { ...epic, stories: storiesByEpic.get(epic.id) ?? [] };
  });
}

export async function taigaListStoryStatuses(
  token: string,
  projectId: number,
  apiBaseUrl?: string,
): Promise<Array<{ id: number; name: string; color: string; is_closed: boolean }>> {
  const raw = await taigaFetch<Record<string, unknown>[]>(
    `/userstory-statuses?project=${projectId}`,
    token,
    apiBaseUrl,
  );
  return (raw ?? []).map((status) => ({
    id: status.id as number,
    name: (status.name as string) || "",
    color: (status.color as string) || "",
    is_closed: (status.is_closed as boolean) ?? false,
  }));
}

export async function taigaGetUsers(
  token: string,
  projectId: number,
  apiBaseUrl?: string,
): Promise<{ memberships: Membership[]; roles: Array<{ id: number; name: string }> }> {
  const [rawMembers, rawRoles] = await Promise.all([
    taigaFetch<Record<string, unknown>[]>(`/memberships?project=${projectId}`, token, apiBaseUrl),
    taigaFetch<Record<string, unknown>[]>(`/roles?project=${projectId}`, token, apiBaseUrl),
  ]);
  const memberships: Membership[] = (rawMembers ?? []).map((member) => ({
    id: member.id as number,
    user: (member.user as number) ?? null,
    username: (member.username as string) || "",
    full_name: (member.full_name as string) || "",
    email: (member.email as string) || "",
    role: (member.role as number) ?? null,
    role_name: (member.role_name as string) || "",
    is_owner: (member.is_owner as boolean) ?? ((member.role_name as string) || "").toLowerCase() === "owner",
  }));
  const roles = (rawRoles ?? []).map((role) => ({
    id: role.id as number,
    name: (role.name as string) || "",
  }));
  return { memberships, roles };
}

export async function taigaCreateEpic(
  token: string,
  projectId: number,
  subject: string,
  description: string,
  tags: string[],
  apiBaseUrl?: string,
): Promise<Epic> {
  const raw = await taigaFetch<Record<string, unknown>>("/epics", token, apiBaseUrl, {
    method: "POST",
    body: { project: projectId, subject, description, tags },
  });
  return normalizeEpic(raw);
}

export async function taigaUpdateEpic(
  token: string,
  epicId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
  apiBaseUrl?: string,
): Promise<Epic> {
  const raw = await taigaFetch<Record<string, unknown>>(`/epics/${epicId}`, token, apiBaseUrl, {
    method: "PATCH",
    body: { version, ...fields },
  });
  return normalizeEpic(raw);
}

export async function taigaDeleteEpic(
  token: string,
  projectId: number,
  epicId: number,
  apiBaseUrl?: string,
): Promise<{ ok: boolean; stories_deleted: number; story_failures: Array<{ story_id: number; error: string }> }> {
  const stories = await taigaFetch<Record<string, unknown>[]>(
    `/userstories?project=${projectId}&epic=${epicId}`,
    token,
    apiBaseUrl,
  );
  const failures: Array<{ story_id: number; error: string }> = [];
  let deleted = 0;
  for (const rawStory of stories ?? []) {
    const storyId = rawStory.id as number | undefined;
    if (!storyId) continue;
    try {
      await taigaFetch<unknown>(`/userstories/${storyId}`, token, apiBaseUrl, { method: "DELETE" });
      deleted += 1;
    } catch (error) {
      failures.push({ story_id: storyId, error: error instanceof Error ? error.message : "Delete failed" });
    }
  }
  await taigaFetch<unknown>(`/epics/${epicId}`, token, apiBaseUrl, { method: "DELETE" });
  return { ok: true, stories_deleted: deleted, story_failures: failures };
}

export async function taigaCreateStory(
  token: string,
  projectId: number,
  epicId: number,
  subject: string,
  description: string,
  tags: string[],
  statusId?: number,
  apiBaseUrl?: string,
): Promise<Story> {
  let raw = await taigaFetch<Record<string, unknown>>("/userstories", token, apiBaseUrl, {
    method: "POST",
    body: { project: projectId, subject, description, tags },
  });
  await taigaFetch<unknown>(`/epics/${epicId}/related_userstories`, token, apiBaseUrl, {
    method: "POST",
    body: { epic: epicId, user_story: raw.id },
  });
  if (statusId) {
    raw = await taigaFetch<Record<string, unknown>>(`/userstories/${raw.id}`, token, apiBaseUrl, {
      method: "PATCH",
      body: { version: raw.version, status: statusId },
    });
  }
  raw = await taigaFetch<Record<string, unknown>>(`/userstories/${raw.id}`, token, apiBaseUrl);
  return normalizeStory(raw);
}

export async function taigaUpdateStory(
  token: string,
  storyId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
  apiBaseUrl?: string,
): Promise<Story> {
  const raw = await taigaFetch<Record<string, unknown>>(`/userstories/${storyId}`, token, apiBaseUrl, {
    method: "PATCH",
    body: { version, ...fields },
  });
  return normalizeStory(raw);
}

export async function taigaDeleteStory(token: string, storyId: number, apiBaseUrl?: string): Promise<void> {
  await taigaFetch<unknown>(`/userstories/${storyId}`, token, apiBaseUrl, { method: "DELETE" });
}

export async function taigaInviteUser(
  token: string,
  projectId: number,
  usernameOrEmail: string,
  roleId: number,
  apiBaseUrl?: string,
): Promise<void> {
  await taigaFetch<unknown>("/memberships", token, apiBaseUrl, {
    method: "POST",
    body: { project: projectId, role: roleId, username: usernameOrEmail },
  });
}

export async function taigaRemoveMember(token: string, membershipId: number, apiBaseUrl?: string): Promise<void> {
  await taigaFetch<unknown>(`/memberships/${membershipId}`, token, apiBaseUrl, { method: "DELETE" });
}

export async function taigaUpdateMemberRole(
  token: string,
  membershipId: number,
  roleId: number,
  apiBaseUrl?: string,
): Promise<void> {
  await taigaFetch<unknown>(`/memberships/${membershipId}`, token, apiBaseUrl, {
    method: "PATCH",
    body: { role: roleId },
  });
}
