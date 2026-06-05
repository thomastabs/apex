"use client";
import { useState } from "react";
import { Github, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSaveGithubConfig, useSyncGithubContext } from "@/lib/hooks/use-workspace";
import { useSessionStore, useGithubContext } from "@/lib/stores/session-store";
import { verifyGithubRepo } from "@/lib/api/github-browser";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type GitHubSectionProps = DragSectionProps & {
  dark: boolean;
  githubRepo: string;
};

export function GitHubSection({ dark, githubRepo, shellClass, dragHandlers, onDragStart }: GitHubSectionProps) {
  const [open, setOpen] = useState(false);
  const [patInput, setPatInput] = useState("");
  const [repoInput, setRepoInput] = useState(githubRepo);
  const [connecting, setConnecting] = useState(false);

  const setGithub = useSessionStore((s) => s.setGithub);
  const github = useGithubContext();
  const saveGithubConfig = useSaveGithubConfig();
  const syncContext = useSyncGithubContext();

  const isConnected = Boolean(github);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const labelClass = "text-xs text-neutral-500";
  const inputClass = "h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500 dark:bg-neutral-950 bg-white dark:text-white text-slate-800";

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
      await verifyGithubRepo({ owner, repo: repoName, pat });
      await saveGithubConfig.mutateAsync(repo);
      setGithub({ pat, repo });
      toast.success(`Connected to ${repo}`);
      setPatInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to GitHub.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setGithub({ pat: "", repo: "" });
    saveGithubConfig.mutate("");
    toast.info("GitHub disconnected.");
  }

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Github className="size-4" />}
          title="GitHub"
          badge={isConnected ? github!.owner + "/" + github!.repo : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("space-y-3 px-4 py-3", expandedPanelClass)}>
            {isConnected ? (
              <>
                <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-600")}>
                  Connected to <span className="font-mono font-semibold">{github!.owner}/{github!.repo}</span>.
                  Click Sync to update <code className="text-[11px]">github-context.md</code> with the latest repo state.
                </p>
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
                    className="inline-flex h-9 items-center justify-center rounded border border-neutral-600 text-sm text-neutral-400 hover:border-red-500/50 hover:text-red-400"
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </button>
                </div>
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
                      Generate PAT ↗
                    </a>
                  </label>
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    className={inputClass}
                    placeholder="ghp_…"
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
