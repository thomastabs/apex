"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, GitBranch, Github, Lock, RefreshCw, Settings2, Star, Webhook } from "lucide-react";
import { toast } from "sonner";
import {
  useGithubWebhookConfig, useSaveGithubConfig, useSyncGithubContext, useGithubPat,
  useServerConfig, useContextFiles, useGithubPackConfig, useSaveGithubPackConfig,
} from "@/lib/hooks/use-workspace";
import { useSessionStore, useGithubContext } from "@/lib/stores/session-store";
import { verifyGithubRepo, type RepoMeta } from "@/lib/api/github-browser";
import { getApiBaseUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";

function copyToClipboard(value: string, label: string, t: ReturnType<typeof useT>) {
  navigator.clipboard.writeText(value)
    .then(() => toast.success(t("github.copySuccess", { label })))
    .catch(() => toast.error(t("github.copyFailed", { label: label.toLowerCase() })));
}

function WebhookSetup({ dark }: { dark: boolean }) {
  const t = useT();
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
        <span className="flex-1 font-medium">{t("github.webhook.title")}</span>
        <span className={dark ? "text-neutral-600" : "text-slate-400"}>{expanded ? t("github.webhook.hide") : t("github.webhook.setUp")}</span>
      </button>
      {expanded ? (
        <div className={cn("space-y-2 border-t px-2.5 py-2.5", dark ? "border-neutral-700" : "border-slate-200")}>
          <p className={cn("leading-snug", dark ? "text-neutral-500" : "text-slate-500")}>
            {t("github.webhook.description")}
          </p>
          {webhook.isLoading ? (
            <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>{t("common.loading")}</p>
          ) : !projectId ? (
            <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>{t("github.webhook.pickProjectFirst")}</p>
          ) : webhook.data ? (
            <>
              <div className="space-y-1">
                <label className={cn("block", dark ? "text-neutral-500" : "text-slate-500")}>{t("github.webhook.payloadUrl")}</label>
                <div className="flex gap-1.5">
                  <input readOnly value={url} className={cn("h-7 min-w-0 flex-1 rounded border px-2 font-mono text-[11px]", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-300 bg-white text-slate-700")} />
                  <button className={cn("grid size-7 shrink-0 place-items-center rounded border", dark ? "border-neutral-700 text-neutral-400 hover:text-violet-300" : "border-slate-300 text-slate-500 hover:text-violet-600")} onClick={() => copyToClipboard(url, t("github.webhook.webhookUrlLabel"), t)}>
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className={cn("block", dark ? "text-neutral-500" : "text-slate-500")}>{t("github.webhook.secret")}</label>
                <div className="flex gap-1.5">
                  <input readOnly type="password" value={webhook.data.secret} className={cn("h-7 min-w-0 flex-1 rounded border px-2 font-mono text-[11px]", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-300 bg-white text-slate-700")} />
                  <button className={cn("grid size-7 shrink-0 place-items-center rounded border", dark ? "border-neutral-700 text-neutral-400 hover:text-violet-300" : "border-slate-300 text-slate-500 hover:text-violet-600")} onClick={() => copyToClipboard(webhook.data!.secret, t("github.webhook.secret"), t)}>
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
              <p className={cn(dark ? "text-neutral-600" : "text-slate-400")}>
                {t("github.webhook.rateLimitNote")}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const PACK_DETAIL_OPTIONS: Array<{ value: "auto" | "full" | "compress"; labelKey: TranslationKey; blurbKey: TranslationKey }> = [
  { value: "auto", labelKey: "github.pack.auto.label", blurbKey: "github.pack.auto.blurb" },
  { value: "full", labelKey: "github.pack.full.label", blurbKey: "github.pack.full.blurb" },
  { value: "compress", labelKey: "github.pack.compress.label", blurbKey: "github.pack.compress.blurb" },
];

function PackSettings({ dark }: { dark: boolean }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"auto" | "full" | "compress">("auto");
  const [maxTokens, setMaxTokens] = useState("");
  const [extraIgnore, setExtraIgnore] = useState("");
  const seeded = useRef(false);

  const packConfig = useGithubPackConfig();
  const save = useSaveGithubPackConfig();

  useEffect(() => {
    if (!packConfig.data || seeded.current) return;
    seeded.current = true;
    setMode(packConfig.data.pack_detail_mode);
    setMaxTokens(packConfig.data.pack_max_tokens ? String(packConfig.data.pack_max_tokens) : "");
    setExtraIgnore(packConfig.data.pack_extra_ignore);
  }, [packConfig.data]);

  const inputClass = cn(
    "h-8 w-full rounded border px-2 text-xs outline-none focus:border-violet-500",
    dark ? "border-neutral-600 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-800",
  );
  const labelClass = cn("block font-medium", dark ? "text-neutral-300" : "text-slate-700");
  const helpClass = cn("mt-1 leading-snug", dark ? "text-neutral-500" : "text-slate-500");

  function handleSave() {
    const tokens = maxTokens.trim() === "" ? 0 : Math.max(0, parseInt(maxTokens, 10) || 0);
    save.mutate(
      { pack_detail_mode: mode, pack_max_tokens: tokens, pack_extra_ignore: extraIgnore.trim() },
      {
        onSuccess: () => toast.success(t("github.pack.toast.saved")),
        onError: (e) => toast.error(e instanceof Error ? e.message : t("github.pack.toast.saveFailed")),
      },
    );
  }

  return (
    <div className={cn("rounded border text-xs", dark ? "border-neutral-700" : "border-slate-200")}>
      <button
        className={cn("flex h-8 w-full items-center gap-2 px-2.5 text-left", dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-600 hover:text-slate-800")}
        onClick={() => setExpanded(!expanded)}
      >
        <Settings2 className="size-3.5" />
        <span className="flex-1 font-medium">{t("github.pack.title")}</span>
        <span className={dark ? "text-neutral-600" : "text-slate-400"}>{expanded ? t("github.webhook.hide") : t("github.pack.configure")}</span>
      </button>
      {expanded ? (
        <div className={cn("space-y-3 border-t px-2.5 py-2.5", dark ? "border-neutral-700" : "border-slate-200")}>
          <p className={cn("leading-snug", dark ? "text-neutral-500" : "text-slate-500")}>
            {t("github.pack.description")}
          </p>

          {packConfig.isLoading ? (
            <p className={dark ? "text-neutral-600" : "text-slate-400"}>{t("common.loading")}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("github.pack.detailLabel")}</label>
                <div className="space-y-1.5">
                  {PACK_DETAIL_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded border p-2",
                        mode === opt.value
                          ? dark ? "border-violet-500/60 bg-violet-500/10" : "border-violet-300 bg-violet-50"
                          : dark ? "border-neutral-700" : "border-slate-200",
                      )}
                    >
                      <input
                        type="radio"
                        name="pack-detail-mode"
                        className="mt-0.5"
                        checked={mode === opt.value}
                        onChange={() => setMode(opt.value)}
                      />
                      <span>
                        <span className={cn("block font-medium", dark ? "text-neutral-200" : "text-slate-800")}>{t(opt.labelKey)}</span>
                        <span className={cn("block leading-snug", dark ? "text-neutral-500" : "text-slate-500")}>{t(opt.blurbKey)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>{t("github.pack.maxTokensLabel")}</label>
                <input
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value.replace(/[^0-9]/g, ""))}
                  className={inputClass}
                  placeholder={t("github.pack.autoPlaceholder")}
                  inputMode="numeric"
                />
                <p className={helpClass}>
                  {t("github.pack.maxTokensHelp")}
                </p>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>{t("github.pack.extraIgnoreLabel")}</label>
                <textarea
                  value={extraIgnore}
                  onChange={(e) => setExtraIgnore(e.target.value)}
                  className={cn(inputClass, "h-16 resize-y py-1.5 font-mono")}
                  placeholder={t("github.pack.extraIgnorePlaceholder")}
                />
                <p className={helpClass}>
                  {t("github.pack.extraIgnoreHelp")}
                </p>
              </div>

              <button
                className="inline-flex h-8 w-full items-center justify-center rounded bg-violet-700 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                disabled={save.isPending}
                onClick={handleSave}
              >
                {save.isPending ? t("common.saving") : t("github.pack.savePackSettings")}
              </button>
            </>
          )}
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
  const t = useT();
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
      toast.error(t("github.toast.enterValidPatRepo"));
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
      toast.success(t("github.toast.connected", { repo }));
      setPatInput("");
      try {
        await saveGithubConfig.mutateAsync({ repo, pat });
      } catch (persistErr) {
        toast.warning(
          persistErr instanceof Error
            ? t("figma.toast.connectedNoServerSaveErr", { err: persistErr.message })
            : t("figma.toast.connectedNoServerSaveGeneric"),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("github.toast.couldNotConnect"));
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setGithub({ pat: "", repo: "" });
    setRepoMeta(null);
    saveGithubConfig.mutate({ repo: "", pat: "" });
    toast.info(t("github.toast.disconnected"));
  }

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Github className="size-4" />}
          title={t("github.panelTitle")}
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
                      {t("github.loadingRepoInfo")}
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
                    <span>{lastSyncedLabel ? t("figma.lastSynced", { date: lastSyncedLabel }) : t("figma.notSyncedYet")}</span>
                    {lastSyncedLabel ? (
	                      <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold",
                        dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                      )}>
                        {t("figma.synced")}
                      </span>
                    ) : (
	                      <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold",
                        dark ? "bg-yellow-900/40 text-yellow-400" : "bg-yellow-50 text-yellow-700"
                      )}>
                        {t("figma.pending")}
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
                      onSuccess: () => toast.success(t("github.toast.contextSynced")),
                      onError: (e) => toast.error(e instanceof Error ? e.message : t("figma.toast.syncFailed")),
                    })}
                  >
                    <RefreshCw className={cn("size-3.5", syncContext.isPending && "animate-spin")} />
                    {syncContext.isPending ? t("figma.syncing") : t("figma.syncContext")}
                  </button>
                  <button
                    className={cn("inline-flex h-9 items-center justify-center rounded border text-sm transition-colors",
                      dark ? "border-neutral-600 text-neutral-400 hover:border-red-500/50 hover:text-red-400" : "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-500"
                    )}
                    onClick={handleDisconnect}
                  >
                    {t("figma.disconnect")}
                  </button>
                </div>

                <p className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                  {t("github.syncedContextNote")}
                </p>

                <PackSettings dark={dark} />
                <WebhookSetup dark={dark} />
              </>
            ) : (
              <>
                <div className={cn("rounded border px-3 py-2 text-xs space-y-0.5",
                  dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 bg-slate-50 text-slate-600"
                )}>
                  <p className={cn("font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>{t("github.connectYourCodebase")}</p>
                  <p>{t("github.aiReferenceNote")}</p>
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>{t("github.repositoryLabel")} <span className="text-neutral-400">{t("github.ownerRepoHint")}</span></label>
                  <input
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    className={inputClass}
                    placeholder={t("github.repoPlaceholder")}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{t("figma.personalAccessToken")}</span>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=Apex"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("hover:underline", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-500")}
                    >
                      {t("github.generatePat")}
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
                  {connecting ? t("figma.connecting") : t("github.connectGithub")}
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
  const t = useT();
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
      restoreToastId.current = toast.loading(t("github.toast.connectingGithub"));
      return;
    }
    if (!patQuery.isFetching && restoreToastId.current !== null) {
      const id = restoreToastId.current;
      restoreToastId.current = null;
      if (patQuery.data?.pat) {
        toast.success(t("github.toast.githubConnected", { repo: serverConfig.data?.github_repo ?? "" }), { id });
      } else {
        toast.dismiss(id);
      }
    }
  }, [shouldRestore, patQuery.isFetching, patQuery.data, serverConfig.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!patQuery.data?.pat || !serverConfig.data?.github_repo) return;
    setGithub({ pat: patQuery.data.pat, repo: serverConfig.data.github_repo });
  }, [patQuery.data, serverConfig.data, setGithub]);

  return null;
}
