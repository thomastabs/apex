"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, GitBranch, Github, Lock, RefreshCw, Star, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useGithubWebhookConfig, useSaveGithubConfig, useSyncGithubContext, useGithubPat, useServerConfig, useContextFiles } from "@/lib/hooks/use-workspace";
import { useSessionStore, useGithubContext } from "@/lib/stores/session-store";
import { verifyGithubRepo, type RepoMeta } from "@/lib/api/github-browser";
import { getApiBaseUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value)
    .then(() => toast.success(`${label} copied.`))
    .catch(() => toast.error(`Could not copy ${label.toLowerCase()}.`));
}

function WebhookSetup({ dark }: { dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const projectId = useSessionStore((s) => s.projectId);
  const webhook = useGithubWebhookConfig(expanded);
  const url = webhook.data && projectId
    ? `${getApiBaseUrl()}/api/webhooks/github/${webhook.data.instance_id}/${projectId}`
    : "";

  return (
    <div className={cn("rounded border text-xs", dark ? "border-neutral-700" : "border-slate-200")}>
      <button
        className={cn("flex h-8 w-full items-center gap-2 px-2.5 text-left", dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-600 hover:text-slate-800")}
        onClick={() => setExpanded(!expanded)}
      >
        <Webhook className="size-3.5" />
        <span className="flex-1 font-medium">Auto regression scan &amp; context sync on push</span>
        <span className={dark ? "text-neutral-600" : "text-slate-400"}>{expanded ? "Hide" : "Set up"}</span>
      </button>
      {expanded ? (
        <div className={cn("space-y-2 border-t px-2.5 py-2.5", dark ? "border-neutral-700" : "border-slate-200")}>
          <p className={cn("leading-snug", dark ? "text-neutral-500" : "text-slate-500")}>
            Add this as a GitHub webhook (repo Settings → Webhooks → Add webhook, content type{" "}
            <code>application/json</code>, event <code>push</code>) and every push re-checks spec↔code
            conformance for the stories it touched — no need to click &quot;Scan for regressions&quot; by hand.
            While this tab is open with GitHub connected, a push also auto-triggers &quot;Sync Context&quot;
            for you.
          </p>
          {webhook.isLoading ? (
            <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>Loading…</p>
          ) : !projectId ? (
            <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>Pick a project first.</p>
          ) : webhook.data ? (
            <>
              <div className="space-y-1">
                <label className={cn("block", dark ? "text-neutral-500" : "text-slate-500")}>Payload URL</label>
                <div className="flex gap-1.5">
                  <input readOnly value={url} className={cn("h-7 min-w-0 flex-1 rounded border px-2 font-mono text-[11px]", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-300 bg-white text-slate-700")} />
                  <button className={cn("grid size-7 shrink-0 place-items-center rounded border", dark ? "border-neutral-700 text-neutral-400 hover:text-violet-300" : "border-slate-300 text-slate-500 hover:text-violet-600")} onClick={() => copyToClipboard(url, "Webhook URL")}>
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className={cn("block", dark ? "text-neutral-500" : "text-slate-500")}>Secret</label>
                <div className="flex gap-1.5">
                  <input readOnly type="password" value={webhook.data.secret} className={cn("h-7 min-w-0 flex-1 rounded border px-2 font-mono text-[11px]", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-300 bg-white text-slate-700")} />
                  <button className={cn("grid size-7 shrink-0 place-items-center rounded border", dark ? "border-neutral-700 text-neutral-400 hover:text-violet-300" : "border-slate-300 text-slate-500 hover:text-violet-600")} onClick={() => copyToClipboard(webhook.data!.secret, "Secret")}>
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
              <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>
                Only re-checks stories that already have a conformance report, capped at 10 per push, with a 5-minute cooldown per project.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type GitHubSectionProps = DragSectionProps & {
  dark: boolean;
  githubRepo: string;
};

export function GitHubSection({ dark, githubRepo, shellClass, dragHandlers, onDragStart }: GitHubSectionProps) {
  const [open, setOpen] = useState(false);
  const [patInput, setPatInput] = useState("");
  const [repoInput, setRepoInput] = useState(githubRepo);
  const [connecting, setConnecting] = useState(false);
  const [repoMeta, setRepoMeta] = useState<RepoMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const setGithub = useSessionStore((s) => s.setGithub);
  const github = useGithubContext();
  const saveGithubConfig = useSaveGithubConfig();
  const syncContext = useSyncGithubContext();
  const contextFiles = useContextFiles();

  const isConnected = Boolean(github);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const labelClass = "text-xs text-neutral-500";
  const inputClass = cn(
    "h-9 w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark ? "border-neutral-600 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-800"
  );

  // Fetch repo metadata when section opens and user is connected
  useEffect(() => {
    if (!open || !isConnected || !github) return;
    if (repoMeta) return;
    setMetaLoading(true);
    verifyGithubRepo(github)
      .then(setRepoMeta)
      .catch(() => {/* PAT may have expired — fail silently */})
      .finally(() => setMetaLoading(false));
  }, [open, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSynced = contextFiles.data?.files.find((f) => f.filename === "github-context.md")?.last_modified;
  const lastSyncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  async function handleConnect() {
    const pat = patInput.trim();
    const repo = repoInput.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    if (!pat || !repo || !repo.includes("/")) {
      toast.error("Enter a valid PAT and repo (owner/repo).");
      return;
    }
    setConnecting(true);
    try {
      const [owner, repoName] = repo.split("/");
      const meta = await verifyGithubRepo({ owner, repo: repoName, pat });
      // The browser session connects on verify alone — persisting server-side
      // (so it survives tab close) is best-effort and must never block or
      // undo a successful connect (e.g. AI_KEY_ENCRYPTION_SECRET unset on this
      // deployment must not make GitHub unusable for the current session).
      setGithub({ pat, repo });
      setRepoMeta(meta);
      toast.success(`Connected to ${repo}`);
      setPatInput("");
      try {
        await saveGithubConfig.mutateAsync({ repo, pat });
      } catch (persistErr) {
        toast.warning(
          persistErr instanceof Error
            ? `Connected, but didn't save server-side: ${persistErr.message}`
            : "Connected, but couldn't save the connection server-side — you'll need to reconnect next session.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to GitHub.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setGithub({ pat: "", repo: "" });
    setRepoMeta(null);
    saveGithubConfig.mutate({ repo: "", pat: "" });
    toast.info("GitHub disconnected.");
  }

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Github className="size-4" />}
          title="GitHub"
          badge={isConnected ? `${github!.owner}/${github!.repo}` : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("space-y-3 px-4 py-3", expandedPanelClass)}>
            {isConnected ? (
              <>
                {/* Repo card */}
                <div className={cn("rounded-lg border p-3 space-y-2",
                  dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50"
                )}>
                  {metaLoading ? (
                    <div className={cn("text-xs animate-pulse", dark ? "text-neutral-500" : "text-slate-400")}>
                      Loading repo info…
                    </div>
                  ) : repoMeta ? (
                    <>
                      {/* Name + link */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {repoMeta.isPrivate && <Lock className="size-3 shrink-0 text-neutral-500" />}
                          <a
                            href={repoMeta.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn("truncate text-sm font-semibold hover:underline",
                              dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-600"
                            )}
                          >
                            {repoMeta.fullName}
                          </a>
                        </div>
                        <a href={repoMeta.htmlUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-neutral-500 hover:text-violet-400">
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>

                      {/* Description */}
                      {repoMeta.description ? (
                        <p className={cn("text-xs leading-snug", dark ? "text-neutral-400" : "text-slate-500")}>
                          {repoMeta.description}
                        </p>
                      ) : null}

                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs">
                        {repoMeta.language ? (
                          <span className={cn("flex items-center gap-1", dark ? "text-neutral-400" : "text-slate-500")}>
                            <span className="size-2.5 rounded-full bg-violet-400 shrink-0" />
                            {repoMeta.language}
                          </span>
                        ) : null}
                        <span className={cn("flex items-center gap-1", dark ? "text-neutral-400" : "text-slate-500")}>
                          <Star className="size-3" />
                          {repoMeta.stars.toLocaleString()}
                        </span>
                        <span className={cn("flex items-center gap-1", dark ? "text-neutral-400" : "text-slate-500")}>
                          <GitBranch className="size-3" />
                          {repoMeta.defaultBranch}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className={cn("text-xs font-mono font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>
                      {github!.owner}/{github!.repo}
                    </div>
                  )}

                  {/* Last synced */}
                  <div className={cn("pt-1 border-t text-xs flex items-center justify-between",
                    dark ? "border-neutral-700 text-neutral-500" : "border-slate-200 text-slate-400"
                  )}>
                    <span>{lastSyncedLabel ? `Last synced ${lastSyncedLabel}` : "Not synced yet"}</span>
                    {lastSyncedLabel ? (
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                      )}>
                        Synced
                      </span>
                    ) : (
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        dark ? "bg-yellow-900/40 text-yellow-400" : "bg-yellow-50 text-yellow-700"
                      )}>
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                    disabled={syncContext.isPending}
                    onClick={() => syncContext.mutate(undefined, {
                      onSuccess: () => toast.success("GitHub context synced."),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed."),
                    })}
                  >
                    <RefreshCw className={cn("size-3.5", syncContext.isPending && "animate-spin")} />
                    {syncContext.isPending ? "Syncing…" : "Sync Context"}
                  </button>
                  <button
                    className={cn("inline-flex h-9 items-center justify-center rounded border text-sm transition-colors",
                      dark ? "border-neutral-600 text-neutral-400 hover:border-red-500/50 hover:text-red-400" : "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-500"
                    )}
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </button>
                </div>

                <p className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                  Synced context is injected into Phase 2 and Phase 3 AI prompts automatically.
                </p>

                <WebhookSetup dark={dark} />
              </>
            ) : (
              <>
                <div className={cn("rounded border px-3 py-2 text-xs space-y-0.5",
                  dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 bg-slate-50 text-slate-600"
                )}>
                  <p className={cn("font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>Connect your codebase</p>
                  <p>AI will reference your repo structure, README, and config files when generating designs and tasks.</p>
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Repository <span className="text-neutral-400">(owner/repo)</span></label>
                  <input
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    className={inputClass}
                    placeholder="myorg/my-repo"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Personal Access Token</span>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=Apex"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("hover:underline", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-500")}
                    >
                      Generate PAT
                    </a>
                  </label>
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    className={inputClass}
                    placeholder="github_pat_… or ghp_…"
                    onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
                    autoComplete="off"
                  />
                </div>
                <button
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-neutral-800 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
                  disabled={connecting || !patInput.trim() || !repoInput.trim()}
                  onClick={handleConnect}
                >
                  <Github className="size-4" />
                  {connecting ? "Connecting…" : "Connect GitHub"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Restores the GitHub session from the server-side encrypted PAT. Mounted
 * unconditionally in the app shell (not inside GitHubSection, which only
 * renders while the Settings modal is open). Context resync-on-push is now
 * handled entirely server-side (backend/app/api/github_webhook.py repacks
 * github-context.md itself on every push) — this component no longer needs
 * to poll and re-trigger a client-side sync itself.
 */
export function GithubAutoSync() {
  const isConnected = Boolean(useGithubContext());

  // Restore the PAT saved server-side (encrypted) so the browser-direct
  // GitHub session survives a tab close / new device without retyping it.
  // The repo name already persists to sessionStorage; only the PAT doesn't.
  const setGithub = useSessionStore((s) => s.setGithub);
  const serverConfig = useServerConfig();
  const shouldRestore = !isConnected
    && Boolean(serverConfig.data?.github_repo)
    && Boolean(serverConfig.data?.github_pat_configured);
  const patQuery = useGithubPat(shouldRestore);

  // Loading toast while the restore fetch is in flight — otherwise a
  // multi-hundred-ms reconnect (sign-in, fresh tab, project switch) happens
  // silently and the user has no idea GitHub is about to come back.
  const restoreToastId = useRef<string | number | null>(null);
  useEffect(() => {
    if (shouldRestore && patQuery.isFetching && restoreToastId.current === null) {
      restoreToastId.current = toast.loading("Connecting GitHub…");
      return;
    }
    if (!patQuery.isFetching && restoreToastId.current !== null) {
      const id = restoreToastId.current;
      restoreToastId.current = null;
      if (patQuery.data?.pat) {
        toast.success(`GitHub connected: ${serverConfig.data?.github_repo}`, { id });
      } else {
        toast.dismiss(id);
      }
    }
  }, [shouldRestore, patQuery.isFetching, patQuery.data, serverConfig.data]);

  useEffect(() => {
    if (!patQuery.data?.pat || !serverConfig.data?.github_repo) return;
    setGithub({ pat: patQuery.data.pat, repo: serverConfig.data.github_repo });
  }, [patQuery.data, serverConfig.data, setGithub]);

  return null;
}
