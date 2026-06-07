/**
 * Browser-side GitHub REST API client for context enrichment.
 * GitHub returns Access-Control-Allow-Origin: * so no proxy needed.
 * PAT sent as Authorization: token <pat>.
 */

const GITHUB_API = "https://api.github.com";

const CHAR_LIMITS = {
  tree: 5_000,
  readme: 5_000,
  configFile: 2_000,
} as const;

const CONFIG_FILE_CANDIDATES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
];

const API_SPEC_CANDIDATES = [
  "openapi.yaml",
  "openapi.json",
  "openapi.yml",
  "swagger.yaml",
  "swagger.json",
  "swagger.yml",
];

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

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n... [truncated at ${limit} chars]`;
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

/** Fetch repo context and return assembled markdown for github-context.md. */
export async function fetchGithubContextMd(ctx: GithubSyncContext): Promise<string> {
  const { owner, repo, pat } = ctx;

  // 1. Repo metadata
  const repoRaw = await ghFetch<Record<string, unknown>>(`/repos/${owner}/${repo}`, pat);
  const repoName = (repoRaw.full_name as string) || `${owner}/${repo}`;
  const repoDesc = (repoRaw.description as string) || "";
  const defaultBranch = (repoRaw.default_branch as string) || "main";
  const language = (repoRaw.language as string) || "";
  const stars = (repoRaw.stargazers_count as number) ?? 0;

  const sections: string[] = [];

  sections.push(
    `# GitHub Repository Context\n\n` +
    `**Repo:** ${repoName}  \n` +
    (repoDesc ? `**Description:** ${repoDesc}  \n` : "") +
    (language ? `**Primary language:** ${language}  \n` : "") +
    `**Default branch:** ${defaultBranch}  \n` +
    `**Stars:** ${stars}  \n` +
    `**Synced:** ${new Date().toISOString().slice(0, 10)}`
  );

  // 2. File tree (recursive)
  try {
    const treeRaw = await ghFetch<{ tree: Array<{ path: string; type: string }> }>(
      `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      pat,
    );
    const paths = (treeRaw.tree ?? [])
      .filter((n) => n.type === "blob")
      .map((n) => n.path)
      .filter((p) => !p.startsWith("node_modules/") && !p.startsWith(".git/") && !p.startsWith("dist/") && !p.startsWith("build/") && !p.startsWith(".next/"))
      .join("\n");
    if (paths) {
      sections.push(`## File Tree\n\n\`\`\`\n${truncate(paths, CHAR_LIMITS.tree)}\n\`\`\``);
    }
  } catch {
    // tree fetch failed — skip silently
  }

  // 3. README
  try {
    const readmeRaw = await ghFetch<{ content: string; encoding: string }>(
      `/repos/${owner}/${repo}/readme`,
      pat,
    );
    if (readmeRaw.content && readmeRaw.encoding === "base64") {
      const decoded = atob(readmeRaw.content.replace(/\n/g, ""));
      sections.push(`## README\n\n${truncate(decoded, CHAR_LIMITS.readme)}`);
    }
  } catch {
    // no README — skip
  }

  // 4. Key config files (first match from each candidate list)
  const treeRaw2 = await ghFetch<{ tree: Array<{ path: string; type: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    pat,
  ).catch(() => ({ tree: [] as Array<{ path: string; type: string }> }));
  const allPaths = new Set((treeRaw2.tree ?? []).map((n) => n.path));

  for (const candidate of CONFIG_FILE_CANDIDATES) {
    if (!allPaths.has(candidate)) continue;
    try {
      const raw = await ghFetch<{ content: string; encoding: string }>(
        `/repos/${owner}/${repo}/contents/${candidate}`,
        pat,
      );
      if (raw.content && raw.encoding === "base64") {
        const decoded = atob(raw.content.replace(/\n/g, ""));
        sections.push(`## \`${candidate}\`\n\n\`\`\`\n${truncate(decoded, CHAR_LIMITS.configFile)}\n\`\`\``);
      }
    } catch {
      // skip
    }
    break;
  }

  for (const candidate of API_SPEC_CANDIDATES) {
    if (!allPaths.has(candidate)) continue;
    try {
      const raw = await ghFetch<{ content: string; encoding: string }>(
        `/repos/${owner}/${repo}/contents/${candidate}`,
        pat,
      );
      if (raw.content && raw.encoding === "base64") {
        const decoded = atob(raw.content.replace(/\n/g, ""));
        sections.push(`## \`${candidate}\` (API Spec)\n\n\`\`\`\n${truncate(decoded, CHAR_LIMITS.configFile)}\n\`\`\``);
      }
    } catch {
      // skip
    }
    break;
  }

  return sections.join("\n\n");
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
