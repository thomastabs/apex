/**
 * Jira Cloud implementation of ProjectManagementAdapter.
 * Uses Jira REST API v3 with Basic auth (email:apiToken base64-encoded).
 *
 * All Jira REST calls are routed through the FastAPI proxy at /api/pm/jira/*
 * to bypass Jira Cloud's CORS restrictions on browser Basic-auth requests.
 * The proxy forwards the Authorization header to Jira Cloud server-side.
 *
 * Auth stored in pmToken field is already base64(email:apiToken).
 */
import { ApiError, getApiBaseUrl } from "./client";
import type { ExternalIssue } from "./github-browser";
import type { PmAuthContext, PmRequestContext, PmTask, PmStoryStatus, ProjectManagementAdapter } from "./pm-types";
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

// ---------------------------------------------------------------------------
// ADF (Atlassian Document Format) helpers
// ---------------------------------------------------------------------------

function mdToAdf(text: string): object {
  const content = text.split("\n\n").filter(Boolean).map((para) => ({
    type: "paragraph",
    content: [{ type: "text", text: para }],
  }));
  return { version: 1, type: "doc", content: content.length ? content : [{ type: "paragraph", content: [] }] };
}

function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return typeof adf === "string" ? adf : "";
  const node = adf as Record<string, unknown>;
  const parts: string[] = [];
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    for (const child of node.content as unknown[]) {
      const childText = adfToText(child);
      if (childText) parts.push(childText);
    }
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function jiraFetch<T>(
  path: string,
  token: string,
  _baseUrl: string, // resolved server-side; kept for call-site compat
  options?: { method?: string; body?: unknown },
): Promise<T> {
  // Strip /rest/api/3 prefix — the backend proxy re-adds it when forwarding to Jira Cloud.
  const jiraPath = path.replace(/^\/rest\/api\/3/, "");
  const url = `${getApiBaseUrl()}/api/pm/jira${jiraPath}`;
  const res = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options?.body != null ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, `Jira error ${res.status}: unexpected non-JSON response`);
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(data.errorMessages) && data.errorMessages.length > 0 ? (data.errorMessages as string[])[0] : null) ||
      (data.message as string) ||
      `Jira error ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

async function jiraFetchAll<T>(
  path: string,
  token: string,
  baseUrl: string,
  resultKey = "issues",
): Promise<T[]> {
  const allItems: T[] = [];
  let startAt = 0;
  const maxResults = 100;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await jiraFetch<Record<string, unknown>>(
      `${path}${sep}startAt=${startAt}&maxResults=${maxResults}`,
      token,
      baseUrl,
    );
    const items = (page[resultKey] as T[]) ?? [];
    allItems.push(...items);
    const total = (page.total as number) ?? 0;
    startAt += items.length;
    if (startAt >= total || items.length === 0) break;
  }
  return allItems;
}

// ---------------------------------------------------------------------------
// Per-project type cache (team-managed vs classic)
// ---------------------------------------------------------------------------

const _projectTypeCache = new Map<string, "next-gen" | "classic">();

export function clearJiraProjectTypeCache(): void {
  _projectTypeCache.clear();
}

async function getProjectStyle(token: string, baseUrl: string, projectKey: string): Promise<"next-gen" | "classic"> {
  // Key includes baseUrl to avoid collisions across different Jira instances with identical project keys
  const cacheKey = `${baseUrl}|${projectKey}`;
  if (_projectTypeCache.has(cacheKey)) return _projectTypeCache.get(cacheKey)!;
  try {
    const raw = await jiraFetch<Record<string, unknown>>(
      `/rest/api/3/project/${projectKey}`,
      token,
      baseUrl,
    );
    const style = ((raw.style as string) || "").toLowerCase();
    const result: "next-gen" | "classic" = style === "next-gen" ? "next-gen" : "classic";
    _projectTypeCache.set(cacheKey, result);
    return result;
  } catch {
    return "classic";
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeIssueAsEpic(raw: Record<string, unknown>): Epic {
  const fields = (raw.fields as Record<string, unknown>) ?? {};
  const desc = adfToText(fields.description);
  return {
    id: parseInt(raw.id as string, 10) || 0,
    ref: parseInt((raw.key as string).split("-")[1] ?? "0", 10),
    subject: (fields.summary as string) || "",
    description: desc,
    version: null,
    tags: Array.isArray(fields.labels) ? (fields.labels as string[]) : [],
  };
}

function normalizeIssueAsStory(raw: Record<string, unknown>): Story {
  const fields = (raw.fields as Record<string, unknown>) ?? {};
  const desc = adfToText(fields.description);
  const parentRaw = fields.parent as Record<string, unknown> | null;
  const parentFields = (parentRaw?.fields as Record<string, unknown>) ?? {};
  const statusRaw = fields.status as Record<string, unknown> | null;
  const statusName = (statusRaw?.name as string) || null;
  // Only link epic_id when parent is actually an Epic — parent could be Initiative or other type
  const parentIssueType = (parentFields.issuetype as Record<string, unknown> | undefined)?.name as string | undefined;
  const epicId = (parentRaw && parentIssueType === "Epic") ? (parseInt(parentRaw.id as string, 10) || null) : null;
  return {
    id: parseInt(raw.id as string, 10) || 0,
    ref: parseInt((raw.key as string).split("-")[1] ?? "0", 10),
    subject: (fields.summary as string) || "",
    description: desc,
    version: null,
    status: statusName,
    tags: Array.isArray(fields.labels) ? (fields.labels as string[]) : [],
    epic_id: epicId,
    epic_subject: epicId ? ((parentFields.summary as string) || "") : "",
  };
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

async function findTransitionId(token: string, baseUrl: string, issueKey: string, targetName: string): Promise<string | null> {
  try {
    const raw = await jiraFetch<{ transitions: Array<{ id: string; name: string }> }>(
      `/rest/api/3/issue/${issueKey}/transitions`,
      token,
      baseUrl,
    );
    const lower = targetName.toLowerCase();
    const found = raw.transitions.find((t) => t.name.toLowerCase().includes(lower));
    return found?.id ?? null;
  } catch {
    return null;
  }
}

async function transitionIssue(token: string, baseUrl: string, issueKey: string, statusName: string): Promise<void> {
  const tid = await findTransitionId(token, baseUrl, issueKey, statusName);
  if (!tid) return;
  await jiraFetch<unknown>(`/rest/api/3/issue/${issueKey}/transitions`, token, baseUrl, {
    method: "POST",
    body: { transition: { id: tid } },
  });
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

const jiraAdapter: ProjectManagementAdapter = {
  name: "jira",

  errMsg: (err, action = "Jira request") => {
    if (err instanceof ApiError && err.status === 401) return "Session expired — check your Jira API token.";
    if (err instanceof Error) return `${action} failed: ${err.message}`;
    return `${action} failed.`;
  },

  isPmVersionConflict: (_err) => false,

  getWebUrl: (baseUrl) => baseUrl.replace(/\/+$/, ""),

  getMe: async (auth: PmAuthContext): Promise<Me> => {
    const raw = await jiraFetch<Record<string, unknown>>("/rest/api/3/myself", auth.token, auth.baseUrl);
    return {
      id: undefined,
      username: (raw.emailAddress as string) || (raw.displayName as string) || "",
      full_name: (raw.displayName as string) || "",
      email: (raw.emailAddress as string) || "",
    };
  },

  listProjects: async (auth: PmAuthContext): Promise<Project[]> => {
    const raw = await jiraFetch<{ values: Record<string, unknown>[] }>(
      "/rest/api/3/project/search?orderBy=name&expand=description&maxResults=100",
      auth.token,
      auth.baseUrl,
    );
    return (raw.values ?? []).map((p) => ({
      id: parseInt(p.id as string, 10) || 0,
      name: (p.name as string) || "",
      slug: (p.key as string) || null,
      description: (p.description as string) || "",
    }));
  },

  createProject: async (_auth, _name, _description, _opts) => {
    throw new Error("Creating Jira projects requires admin privileges. Please create the project in Jira and connect to it here.");
  },

  listProjectTemplates: async (_auth) => [],

  updateProject: async (_auth, _projectId, _fields) => {
    throw new Error("Editing project details is supported for Taiga projects only. Edit Jira projects in the Jira UI.");
  },

  deleteProject: async (auth: PmAuthContext, projectId: string): Promise<{ ok: boolean }> => {
    await jiraFetch<unknown>(`/rest/api/3/project/${projectId}`, auth.token, auth.baseUrl, { method: "DELETE" });
    return { ok: true };
  },

  getBoard: async (ctx: PmRequestContext): Promise<EpicWithStories[]> => {
    const [rawEpics, rawStories] = await Promise.all([
      jiraFetchAll<Record<string, unknown>>(
        `/rest/api/3/search?jql=${encodeURIComponent(`project=${ctx.projectId} AND issuetype=Epic ORDER BY created ASC`)}&fields=id,key,summary,description,labels`,
        ctx.token,
        ctx.baseUrl,
      ),
      jiraFetchAll<Record<string, unknown>>(
        `/rest/api/3/search?jql=${encodeURIComponent(`project=${ctx.projectId} AND issuetype=Story ORDER BY created ASC`)}&fields=id,key,summary,description,labels,parent,status`,
        ctx.token,
        ctx.baseUrl,
      ),
    ]);
    const epicMap = new Map<number, Epic & { stories: Story[] }>();
    for (const rawEpic of rawEpics) {
      const epic = normalizeIssueAsEpic(rawEpic);
      epicMap.set(epic.id, { ...epic, stories: [] });
    }
    const orphanStories: Story[] = [];
    for (const rawStory of rawStories) {
      const story = normalizeIssueAsStory(rawStory);
      if (story.epic_id != null && epicMap.has(story.epic_id)) {
        epicMap.get(story.epic_id)!.stories.push(story);
      } else {
        // Story's epic not in this project's epic list (deleted/cross-project); collect as orphan
        orphanStories.push(story);
      }
    }
    const result = Array.from(epicMap.values());
    if (orphanStories.length > 0) {
      // Synthesise a virtual "Unepiced Stories" epic so orphaned stories are still visible
      result.push({
        id: 0,
        ref: 0,
        subject: "Stories without Epic",
        description: "",
        version: null,
        tags: [],
        stories: orphanStories,
      });
    }
    return result;
  },

  getEpic: async (ctx: PmRequestContext, epicId: string): Promise<Epic> => {
    const raw = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${epicId}?fields=id,key,summary,description,labels`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsEpic(raw);
  },

  createEpic: async (ctx: PmRequestContext, subject: string, description: string, tags: string[]): Promise<Epic> => {
    const raw = await jiraFetch<Record<string, unknown>>("/rest/api/3/issue", ctx.token, ctx.baseUrl, {
      method: "POST",
      body: {
        fields: {
          project: { key: ctx.projectId },
          issuetype: { name: "Epic" },
          summary: subject,
          description: mdToAdf(description),
          labels: tags,
        },
      },
    });
    const created = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${raw.key}?fields=id,key,summary,description,labels`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsEpic(created);
  },

  updateEpic: async (ctx: PmRequestContext, epicId: string, _version: string | number, fields: { subject?: string; description?: string; tags?: string[] }): Promise<Epic> => {
    const body: Record<string, unknown> = {};
    if (fields.subject !== undefined) body.summary = fields.subject;
    if (fields.description !== undefined) body.description = mdToAdf(fields.description);
    if (fields.tags !== undefined) body.labels = fields.tags;
    await jiraFetch<unknown>(`/rest/api/3/issue/${epicId}`, ctx.token, ctx.baseUrl, {
      method: "PUT",
      body: { fields: body },
    });
    const updated = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${epicId}?fields=id,key,summary,description,labels`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsEpic(updated);
  },

  deleteEpic: async (ctx: PmRequestContext, epicId: string) => {
    const rawStories = await jiraFetchAll<Record<string, unknown>>(
      `/rest/api/3/search?jql=${encodeURIComponent(`parent=${epicId}`)}&fields=id,key`,
      ctx.token,
      ctx.baseUrl,
    );
    const results = await Promise.allSettled(
      rawStories.map((rawStory) => {
        const key = (rawStory.key as string) || String(rawStory.id);
        return jiraFetch<unknown>(`/rest/api/3/issue/${key}`, ctx.token, ctx.baseUrl, { method: "DELETE" }).then(() => key);
      }),
    );
    let deleted = 0;
    const failures: Array<{ story_id: string; error: string }> = [];
    for (const [i, result] of results.entries()) {
      if (result.status === "fulfilled") {
        deleted++;
      } else {
        const key = (rawStories[i].key as string) || String(rawStories[i].id);
        failures.push({ story_id: key, error: result.reason instanceof Error ? result.reason.message : "Delete failed" });
      }
    }
    await jiraFetch<unknown>(`/rest/api/3/issue/${epicId}`, ctx.token, ctx.baseUrl, { method: "DELETE" });
    return { ok: true, stories_deleted: deleted, story_failures: failures };
  },

  getStory: async (ctx: PmRequestContext, storyId: string): Promise<Story> => {
    const raw = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${storyId}?fields=id,key,summary,description,labels,parent,status`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsStory(raw);
  },

  createStory: async (ctx: PmRequestContext, epicId: string, subject: string, description: string, tags: string[], _statusId?: string): Promise<Story> => {
    const style = await getProjectStyle(ctx.token, ctx.baseUrl, ctx.projectId);
    const epicField = style === "next-gen"
      ? { parent: { key: epicId } }
      : { customfield_10014: epicId };
    const raw = await jiraFetch<Record<string, unknown>>("/rest/api/3/issue", ctx.token, ctx.baseUrl, {
      method: "POST",
      body: {
        fields: {
          project: { key: ctx.projectId },
          issuetype: { name: "Story" },
          summary: subject,
          description: mdToAdf(description),
          labels: tags,
          ...epicField,
        },
      },
    });
    const created = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${raw.key}?fields=id,key,summary,description,labels,parent,status`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsStory(created);
  },

  updateStory: async (ctx: PmRequestContext, storyId: string, _version: string | number, fields: { subject?: string; description?: string; tags?: string[]; status?: string }): Promise<Story> => {
    const { status, ...rest } = fields;
    const body: Record<string, unknown> = {};
    if (rest.subject !== undefined) body.summary = rest.subject;
    if (rest.description !== undefined) body.description = mdToAdf(rest.description);
    if (rest.tags !== undefined) body.labels = rest.tags;
    if (Object.keys(body).length > 0) {
      await jiraFetch<unknown>(`/rest/api/3/issue/${storyId}`, ctx.token, ctx.baseUrl, {
        method: "PUT",
        body: { fields: body },
      });
    }
    if (status) {
      await transitionIssue(ctx.token, ctx.baseUrl, storyId, status);
    }
    const updated = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${storyId}?fields=id,key,summary,description,labels,parent,status`, ctx.token, ctx.baseUrl);
    return normalizeIssueAsStory(updated);
  },

  deleteStory: async (ctx: PmRequestContext, storyId: string): Promise<void> => {
    await jiraFetch<unknown>(`/rest/api/3/issue/${storyId}`, ctx.token, ctx.baseUrl, { method: "DELETE" });
  },

  listStoryStatuses: async (ctx: PmRequestContext): Promise<PmStoryStatus[]> => {
    const raw = await jiraFetch<Array<{ id: string; name: string; statuses: Array<{ id: string; name: string; statusCategory: { colorName: string } }> }>>(
      `/rest/api/3/project/${ctx.projectId}/statuses`,
      ctx.token,
      ctx.baseUrl,
    );
    const storyType = raw.find((t) => t.name === "Story") ?? raw[0];
    return (storyType?.statuses ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.statusCategory?.colorName ?? "#888",
      is_closed: s.name.toLowerCase().includes("done") || s.name.toLowerCase().includes("closed"),
    }));
  },

  getUsers: async (ctx: PmRequestContext) => {
    const rolesRaw = await jiraFetch<Record<string, string>>(`/rest/api/3/project/${ctx.projectId}/role`, ctx.token, ctx.baseUrl);
    const roles: Array<{ id: string; name: string }> = [];
    const memberships: Membership[] = [];
    const seen = new Set<string>();
    await Promise.all(
      Object.entries(rolesRaw).map(async ([roleName, roleUrl]) => {
        try {
          const roleId = roleUrl.split("/").pop() ?? "";
          roles.push({ id: roleId, name: roleName });
          const roleData = await jiraFetch<{ actors: Array<{ id: number; displayName: string; type: string; actorUser?: { accountId: string } }> }>(
            `/rest/api/3/project/${ctx.projectId}/role/${roleId}`,
            ctx.token,
            ctx.baseUrl,
          );
          for (const actor of roleData.actors ?? []) {
            const accountId = actor.actorUser?.accountId ?? String(actor.id);
            if (seen.has(accountId)) continue;
            seen.add(accountId);
            // Encode "roleId:accountId" so removeMember/updateMemberRole can split it back
            const membershipKey = `${roleId}:${accountId}`;
            memberships.push({
              id: membershipKey as unknown as number, // interface uses number; Jira adapter uses encoded string
              user: actor.id,
              username: accountId,
              full_name: actor.displayName,
              email: "",
              role: parseInt(roleId, 10) || actor.id,
              role_name: roleName,
              is_owner: roleName.toLowerCase().includes("admin") || roleName.toLowerCase().includes("owner"),
            });
          }
        } catch {
          // skip inaccessible roles
        }
      }),
    );
    return { memberships, roles };
  },

  inviteUser: async (ctx: PmRequestContext, usernameOrEmail: string, roleId: string): Promise<void> => {
    let accountId = usernameOrEmail;
    try {
      const users = await jiraFetch<Array<{ accountId: string }>>(
        `/rest/api/3/user/search?query=${encodeURIComponent(usernameOrEmail)}&maxResults=1`,
        ctx.token,
        ctx.baseUrl,
      );
      if (users.length > 0) accountId = users[0].accountId;
    } catch {
      // fall through with original value
    }
    await jiraFetch<unknown>(`/rest/api/3/project/${ctx.projectId}/role/${roleId}`, ctx.token, ctx.baseUrl, {
      method: "POST",
      body: { user: [accountId] },
    });
  },

  removeMember: async (ctx: PmRequestContext, membershipId: string): Promise<void> => {
    // membershipId format: "roleId:accountId"
    const [roleId, accountId] = membershipId.split(":");
    if (!roleId || !accountId) return;
    await jiraFetch<unknown>(
      `/rest/api/3/project/${ctx.projectId}/role/${roleId}?user=${encodeURIComponent(accountId)}`,
      ctx.token,
      ctx.baseUrl,
      { method: "DELETE" },
    );
  },

  updateMemberRole: async (ctx: PmRequestContext, membershipId: string, newRoleId: string): Promise<void> => {
    const [oldRoleId, accountId] = membershipId.split(":");
    if (!oldRoleId || !accountId) return;
    await jiraFetch<unknown>(`/rest/api/3/project/${ctx.projectId}/role/${newRoleId}`, ctx.token, ctx.baseUrl, {
      method: "POST",
      body: { user: [accountId] },
    });
    await jiraFetch<unknown>(
      `/rest/api/3/project/${ctx.projectId}/role/${oldRoleId}?user=${encodeURIComponent(accountId)}`,
      ctx.token,
      ctx.baseUrl,
      { method: "DELETE" },
    ).catch(() => undefined);
  },

  getProjectTasks: async (ctx: PmRequestContext): Promise<PmTask[]> => {
    // subTaskIssueTypes() is a Jira JQL function that matches any subtask type regardless of naming
    // ("Subtask", "Sub-task", custom names) — avoids legacy/Cloud naming differences
    const rawTasks = await jiraFetchAll<Record<string, unknown>>(
      `/rest/api/3/search?jql=${encodeURIComponent(`project=${ctx.projectId} AND issuetype in subTaskIssueTypes() ORDER BY created ASC`)}&fields=id,key,summary,description,parent`,
      ctx.token,
      ctx.baseUrl,
    );
    return rawTasks.map((t) => {
      const fields = (t.fields as Record<string, unknown>) ?? {};
      const parentRaw = fields.parent as Record<string, unknown> | null;
      const parentFields = (parentRaw?.fields as Record<string, unknown>) ?? {};
      return {
        id: t.key as string,
        ref: t.key as string,
        subject: (fields.summary as string) || "",
        description: adfToText(fields.description),
        version: 1,
        user_story: (parentRaw?.key as string) || "",
        user_story_ref: (parentRaw?.key as string) || "",
        user_story_subject: (parentFields.summary as string) || "",
      };
    });
  },

  getTask: async (ctx: PmRequestContext, taskId: string): Promise<PmTask> => {
    const raw = await jiraFetch<Record<string, unknown>>(`/rest/api/3/issue/${taskId}?fields=id,key,summary,description,parent`, ctx.token, ctx.baseUrl);
    const fields = (raw.fields as Record<string, unknown>) ?? {};
    const parentRaw = fields.parent as Record<string, unknown> | null;
    const parentFields = (parentRaw?.fields as Record<string, unknown>) ?? {};
    return {
      id: raw.key as string,
      ref: raw.key as string,
      subject: (fields.summary as string) || "",
      description: adfToText(fields.description),
      version: 1,
      user_story: (parentRaw?.key as string) || "",
      user_story_ref: (parentRaw?.key as string) || "",
      user_story_subject: (parentFields.summary as string) || "",
    };
  },

  createTask: async (ctx: PmRequestContext, storyId: string, subject: string, description: string, _points?: number) => {
    const raw = await jiraFetch<Record<string, unknown>>("/rest/api/3/issue", ctx.token, ctx.baseUrl, {
      method: "POST",
      body: {
        fields: {
          project: { key: ctx.projectId },
          parent: { key: storyId },
          issuetype: { name: "Subtask" },
          summary: subject,
          description: mdToAdf(description),
        },
      },
    });
    return { id: raw.key as string, ref: raw.key as string, subject };
  },

  updateTask: async (ctx: PmRequestContext, taskId: string, _version: string | number, updates: { subject?: string; description?: string }): Promise<void> => {
    const body: Record<string, unknown> = {};
    if (updates.subject !== undefined) body.summary = updates.subject;
    if (updates.description !== undefined) body.description = mdToAdf(updates.description);
    if (Object.keys(body).length === 0) return;
    await jiraFetch<unknown>(`/rest/api/3/issue/${taskId}`, ctx.token, ctx.baseUrl, {
      method: "PUT",
      body: { fields: body },
    });
  },

  deleteTask: async (ctx: PmRequestContext, taskId: string): Promise<void> => {
    await jiraFetch<unknown>(`/rest/api/3/issue/${taskId}`, ctx.token, ctx.baseUrl, { method: "DELETE" });
  },
};

export { jiraAdapter };

/**
 * List open Jira issues in the project for Phase 6 maintenance intake.
 * Mirrors fetchGithubIssues / taigaListIssues (returns ExternalIssue[]).
 */
export async function jiraListIssues(ctx: PmRequestContext): Promise<ExternalIssue[]> {
  const jql = `project=${ctx.projectId} AND statusCategory != Done ORDER BY updated DESC`;
  const raw = await jiraFetch<{ issues?: Array<Record<string, unknown>> }>(
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,description&maxResults=50`,
    ctx.token,
    ctx.baseUrl,
  );
  return (raw.issues ?? []).map((i) => {
    const fields = (i.fields ?? {}) as Record<string, unknown>;
    return {
      ext_ref: String(i.key ?? ""),
      subject: String(fields.summary ?? ""),
      description: adfToText(fields.description),
    };
  });
}
