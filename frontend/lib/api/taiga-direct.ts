/**
 * Direct Taiga API calls from the browser.
 * Bypasses the FastAPI backend so Azure egress IPs are never involved.
 * All functions throw ApiError on failure for compatibility with existing hooks.
 */
import { ApiError } from "./client";
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

const TAIGA_API = "https://api.taiga.io/api/v1";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function taigaFetch<T>(
  path: string,
  token: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${TAIGA_API}${path}`;
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
  return rawTags.flatMap((t) => {
    if (Array.isArray(t) && t.length > 0) return [String(t[0])];
    if (typeof t === "string" && t) return [t];
    return [];
  });
}

function normalizeEpic(raw: Record<string, unknown>): Epic {
  return {
    id: raw.id as number,
    ref: (raw.ref ?? raw.id) as number,
    subject: (raw.subject as string) || "",
    description: (raw.description as string) || "",
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
    description: (raw.description as string) || "",
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

export async function taigaGetMe(token: string): Promise<Me> {
  const raw = await taigaFetch<Record<string, unknown>>("/users/me", token);
  return {
    id: raw.id as number,
    username: (raw.username as string) || "",
    full_name: (raw.full_name as string) || "",
    email: (raw.email as string) || "",
  };
}

export async function taigaListProjects(token: string): Promise<Project[]> {
  const me = await taigaFetch<{ id: number }>("/users/me", token);
  const raw = await taigaFetch<Record<string, unknown>[]>(
    `/projects?member=${me.id}&order_by=name`,
    token,
  );
  return (raw ?? []).map((r) => ({
    id: r.id as number,
    name: (r.name as string) || "",
    slug: (r.slug as string) ?? null,
    description: (r.description as string) || "",
  }));
}

export async function taigaCreateProject(token: string, name: string, description: string): Promise<Project> {
  const raw = await taigaFetch<Record<string, unknown>>("/projects", token, {
    method: "POST",
    body: { name, description },
  });
  return {
    id: raw.id as number,
    name: (raw.name as string) || "",
    slug: (raw.slug as string) ?? null,
    description: (raw.description as string) || "",
  };
}

export async function taigaDeleteProject(token: string, projectId: number): Promise<{ ok: boolean }> {
  await taigaFetch<unknown>(`/projects/${projectId}`, token, { method: "DELETE" });
  return { ok: true };
}

export async function taigaGetBoard(token: string, projectId: number): Promise<EpicWithStories[]> {
  const [rawEpics, rawStories] = await Promise.all([
    taigaFetch<Record<string, unknown>[]>(`/epics?project=${projectId}&order_by=ref`, token),
    taigaFetch<Record<string, unknown>[]>(`/userstories?project=${projectId}`, token),
  ]);
  const storiesByEpic = new Map<number, Story[]>();
  for (const rs of rawStories ?? []) {
    const story = normalizeStory(rs);
    if (story.epic_id != null) {
      const arr = storiesByEpic.get(story.epic_id) ?? [];
      arr.push(story);
      storiesByEpic.set(story.epic_id, arr);
    }
  }
  return (rawEpics ?? []).map((re) => {
    const epic = normalizeEpic(re);
    return { ...epic, stories: storiesByEpic.get(epic.id) ?? [] };
  });
}

export async function taigaListStoryStatuses(
  token: string,
  projectId: number,
): Promise<Array<{ id: number; name: string; color: string; is_closed: boolean }>> {
  const raw = await taigaFetch<Record<string, unknown>[]>(
    `/userstory-statuses?project=${projectId}`,
    token,
  );
  return (raw ?? []).map((s) => ({
    id: s.id as number,
    name: (s.name as string) || "",
    color: (s.color as string) || "",
    is_closed: (s.is_closed as boolean) ?? false,
  }));
}

export async function taigaGetUsers(
  token: string,
  projectId: number,
): Promise<{ memberships: Membership[]; roles: Array<{ id: number; name: string }> }> {
  const [rawMembers, rawRoles] = await Promise.all([
    taigaFetch<Record<string, unknown>[]>(`/memberships?project=${projectId}`, token),
    taigaFetch<Record<string, unknown>[]>(`/roles?project=${projectId}`, token),
  ]);
  const memberships: Membership[] = (rawMembers ?? []).map((m) => ({
    id: m.id as number,
    user: (m.user as number) ?? null,
    username: (m.username as string) || "",
    full_name: (m.full_name as string) || "",
    email: (m.email as string) || "",
    role: (m.role as number) ?? null,
    role_name: (m.role_name as string) || "",
    is_owner: (m.is_owner as boolean) ?? ((m.role_name as string) || "").toLowerCase() === "owner",
  }));
  const roles = (rawRoles ?? []).map((r) => ({
    id: r.id as number,
    name: (r.name as string) || "",
  }));
  return { memberships, roles };
}

export async function taigaCreateEpic(
  token: string,
  projectId: number,
  subject: string,
  description: string,
  tags: string[],
): Promise<Epic> {
  const raw = await taigaFetch<Record<string, unknown>>("/epics", token, {
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
): Promise<Epic> {
  const raw = await taigaFetch<Record<string, unknown>>(`/epics/${epicId}`, token, {
    method: "PATCH",
    body: { version, ...fields },
  });
  return normalizeEpic(raw);
}

export async function taigaDeleteEpic(token: string, epicId: number): Promise<void> {
  await taigaFetch<unknown>(`/epics/${epicId}`, token, { method: "DELETE" });
}

export async function taigaCreateStory(
  token: string,
  projectId: number,
  epicId: number,
  subject: string,
  description: string,
  tags: string[],
  statusId?: number,
): Promise<Story> {
  const raw = await taigaFetch<Record<string, unknown>>("/userstories", token, {
    method: "POST",
    body: { project: projectId, epic: epicId, subject, description, tags, status: statusId ?? undefined },
  });
  return normalizeStory(raw);
}

export async function taigaUpdateStory(
  token: string,
  storyId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
): Promise<Story> {
  const raw = await taigaFetch<Record<string, unknown>>(`/userstories/${storyId}`, token, {
    method: "PATCH",
    body: { version, ...fields },
  });
  return normalizeStory(raw);
}

export async function taigaDeleteStory(token: string, storyId: number): Promise<void> {
  await taigaFetch<unknown>(`/userstories/${storyId}`, token, { method: "DELETE" });
}

export async function taigaInviteUser(
  token: string,
  projectId: number,
  usernameOrEmail: string,
  roleId: number,
): Promise<void> {
  await taigaFetch<unknown>("/memberships", token, {
    method: "POST",
    body: { project: projectId, role: roleId, username: usernameOrEmail },
  });
}

export async function taigaRemoveMember(token: string, membershipId: number): Promise<void> {
  await taigaFetch<unknown>(`/memberships/${membershipId}`, token, { method: "DELETE" });
}

export async function taigaUpdateMemberRole(
  token: string,
  membershipId: number,
  roleId: number,
): Promise<void> {
  await taigaFetch<unknown>(`/memberships/${membershipId}`, token, {
    method: "PATCH",
    body: { role: roleId },
  });
}
