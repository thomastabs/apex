/**
 * Browser-side GitHub REST API client for context enrichment.
 * GitHub returns Access-Control-Allow-Origin: * so no proxy needed.
 * PAT sent as Authorization: token <pat>.
 */

import { ApiError, ApiNetworkError } from "./client";

const GITHUB_API = "https://api.github.com";

/** GitHub's error bodies are `{message, documentation_url}`, not FastAPI's
 *  `{detail}`. Normalise into ApiError so these failures classify (and toast)
 *  exactly like every backend failure. */
async function ghError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body.message === "string" && body.message ? body.message : null;
  if (res.status === 404) {
    return new ApiError(404, message ?? "GitHub could not find that repository - check the owner/repo and that the token can see it.");
  }
  if (res.status === 401 || res.status === 403) {
    return new ApiError(res.status, message ?? "GitHub rejected the token. Check the PAT and its scopes in Settings.");
  }
  return new ApiError(res.status, message ?? `GitHub returned ${res.status}.`);
}

function ghHeaders(pat: string): HeadersInit {
  return {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch<T>(path: string, pat: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: ghHeaders(pat) });
  } catch (err) {
    throw err instanceof TypeError ? new ApiNetworkError(err) : err;
  }
  if (!res.ok) throw await ghError(res);
  return res.json() as Promise<T>;
}

async function ghPost<T>(path: string, pat: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      method: "POST",
      headers: { ...ghHeaders(pat), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw err instanceof TypeError ? new ApiNetworkError(err) : err;
  }
  if (!res.ok) throw await ghError(res);
  return res.json() as Promise<T>;
}

export interface GithubSyncContext {
  owner: string;
  repo: string;
  pat: string;
}

export interface RepoMeta {
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  defaultBranch: string;
  htmlUrl: string;
  isPrivate: boolean;
}

/** Verify a repo is accessible and return its metadata. Throws if PAT or repo is wrong. */
export async function verifyGithubRepo(ctx: GithubSyncContext): Promise<RepoMeta> {
  const raw = await ghFetch<Record<string, unknown>>(`/repos/${ctx.owner}/${ctx.repo}`, ctx.pat);
  return {
    fullName: (raw.full_name as string) || `${ctx.owner}/${ctx.repo}`,
    description: (raw.description as string) || "",
    language: (raw.language as string) || "",
    stars: (raw.stargazers_count as number) ?? 0,
    forks: (raw.forks_count as number) ?? 0,
    defaultBranch: (raw.default_branch as string) || "main",
    htmlUrl: (raw.html_url as string) || `https://github.com/${ctx.owner}/${ctx.repo}`,
    isPrivate: Boolean(raw.private),
  };
}

/** Fetch recent commits and return those whose messages match task subject keywords as markdown. */
export async function fetchRecentCommitsContext(ctx: GithubSyncContext, taskSubject: string): Promise<string> {
  type CommitItem = { sha: string; commit: { message: string; author: { date: string; name: string } } };
  const commits = await ghFetch<CommitItem[]>(
    `/repos/${ctx.owner}/${ctx.repo}/commits?per_page=30`,
    ctx.pat,
  );
  const keywords = taskSubject.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return "";
  const scored = commits
    .map((c) => {
      const msg = c.commit.message.toLowerCase();
      return { ...c, score: keywords.filter((k) => msg.includes(k)).length };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (scored.length === 0) return "";
  const lines = scored.map((c) => {
    const firstLine = c.commit.message.split("\n")[0].trim().slice(0, 100);
    const date = c.commit.author.date.slice(0, 10);
    return `- ${date}: ${firstLine} (${c.sha.slice(0, 7)})`;
  });
  return `## Recent Related Commits\n\n${lines.join("\n")}`;
}

/** Fetch a single file's decoded text content (for on-demand conformance context). */
export async function fetchGithubFile(ctx: GithubSyncContext, path: string): Promise<string> {
  const raw = await ghFetch<{ content?: string; encoding?: string }>(
    `/repos/${ctx.owner}/${ctx.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    ctx.pat,
  );
  if (raw.content && raw.encoding === "base64") {
    // atob() alone decodes base64 into a byte-per-char Latin-1 string, mangling
    // any non-ASCII content — re-decode those bytes as UTF-8.
    const bytes = Uint8Array.from(atob(raw.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return "";
}

// created_at (ISO 8601, when the upstream issue was actually reported) is
// optional: GitHub/Taiga/Plane all carry it, but not every source can (Figma
// comments have no equivalent). When present it becomes a maintenance item's
// `detected_at` on import, so AnalyticsService's escape-rate calc measures
// from the real report time instead of Apex's own (later) import time.
// severity is the PM tool's own ground-truth label (Taiga's project-configurable
// severity name, or Plane's priority) — optional since GitHub/Figma have no
// equivalent concept. Persisted on import so a human deciding Fast/Secure
// Lane sees it, distinct from (and a check on) the AI's own severity_hint.
export type ExternalIssue = { ext_ref: string; subject: string; description: string; created_at?: string; severity?: string };

/** List open GitHub Issues (excluding PRs) as maintenance-intake candidates. */
export async function fetchGithubIssues(ctx: GithubSyncContext): Promise<ExternalIssue[]> {
  const raw = await ghFetch<Array<{ number: number; title: string; body: string | null; pull_request?: unknown; created_at?: string }>>(
    `/repos/${ctx.owner}/${ctx.repo}/issues?state=open&per_page=50`,
    ctx.pat,
  );
  return (raw ?? [])
    .filter((i) => !i.pull_request) // the issues endpoint also returns PRs
    .map((i) => ({ ext_ref: `GH#${i.number}`, subject: i.title, description: i.body ?? "", created_at: i.created_at }));
}

/** Create a GitHub Issue and return its URL and number. Requires PAT with repo scope. */
export async function createGithubIssue(
  ctx: GithubSyncContext,
  title: string,
  body: string,
): Promise<{ url: string; number: number }> {
  const data = await ghPost<{ html_url: string; number: number }>(
    `/repos/${ctx.owner}/${ctx.repo}/issues`,
    ctx.pat,
    { title, body },
  );
  return { url: data.html_url, number: data.number };
}
