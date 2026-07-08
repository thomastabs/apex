/**
 * Browser-side GitHub REST API client for context enrichment.
 * GitHub returns Access-Control-Allow-Origin: * so no proxy needed.
 * PAT sent as Authorization: token <pat>.
 */

const GITHUB_API = "https://api.github.com";

function ghHeaders(pat: string): HeadersInit {
  return {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch<T>(path: string, pat: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: ghHeaders(pat) });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((msg.message as string) || `GitHub ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function ghPost<T>(path: string, pat: string, body: unknown): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: "POST",
    headers: { ...ghHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((msg.message as string) || `GitHub ${res.status}`);
  }
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
    `/repos/${ctx.owner}/${ctx.repo}/contents/${path}`,
    ctx.pat,
  );
  if (raw.content && raw.encoding === "base64") {
    return atob(raw.content.replace(/\n/g, ""));
  }
  return "";
}

export type ExternalIssue = { ext_ref: string; subject: string; description: string };

/** List open GitHub Issues (excluding PRs) as maintenance-intake candidates. */
export async function fetchGithubIssues(ctx: GithubSyncContext): Promise<ExternalIssue[]> {
  const raw = await ghFetch<Array<{ number: number; title: string; body: string | null; pull_request?: unknown }>>(
    `/repos/${ctx.owner}/${ctx.repo}/issues?state=open&per_page=50`,
    ctx.pat,
  );
  return (raw ?? [])
    .filter((i) => !i.pull_request) // the issues endpoint also returns PRs
    .map((i) => ({ ext_ref: `GH#${i.number}`, subject: i.title, description: i.body ?? "" }));
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
