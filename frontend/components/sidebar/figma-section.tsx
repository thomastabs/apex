"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Figma, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSaveFigmaConfig, useSyncFigmaContext, useScanFigmaChanges, useContextFiles, useStoryIndexStats } from "@/lib/hooks/use-workspace";
import { useSessionStore, useFigmaContext } from "@/lib/stores/session-store";
import {
  figmaVerifyFile,
  parseFigmaUrl,
  parseFigmaProjectUrl,
  figmaGetProjectFiles,
  figmaOAuthEnabled,
  figmaOAuthAuthorizeUrl,
  FIGMA_OAUTH_STATE_KEY,
  type FigmaProjectFile,
} from "@/lib/api/figma";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type FigmaSectionProps = DragSectionProps & {
  dark: boolean;
  figmaFileKey: string;
};

export function FigmaSection({ dark, figmaFileKey, shellClass, dragHandlers, onDragStart }: FigmaSectionProps) {
  const [open, setOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  // Project picker (Stage 1): when the URL is a project, list its files and let
  // the user pick one. Picking sets a single fileKey — downstream is unchanged.
  const [projectFiles, setProjectFiles] = useState<FigmaProjectFile[] | null>(null);
  // OAuth (operator-gated): when the deployment registered a Figma app, offer a
  // "Connect with Figma" button. After the redirect dance the access token lands
  // in the session (set by /figma/callback) with no file yet → the user then just
  // picks a file, reusing the existing URL/picker flow with the session token.
  const [oauthEnabled, setOauthEnabled] = useState(false);

  const setFigma = useSessionStore((s) => s.setFigma);
  const sessionToken = useSessionStore((s) => s.figmaToken);
  const figma = useFigmaContext();
  // Signed in via OAuth (token in session) but no file chosen yet.
  const oauthAwaitingFile = Boolean(sessionToken) && !figmaFileKey;
  const saveFigmaConfig = useSaveFigmaConfig();
  const syncContext = useSyncFigmaContext();
  const scanChanges = useScanFigmaChanges();
  const contextFiles = useContextFiles();
  const storyStats = useStoryIndexStats();

  async function handleScanChanges() {
    if (!figma) return;
    try {
      // Distinct file keys across linked stories; "" = the connected (configured) file.
      const links = storyStats.data?.figma_links ?? [];
      const keys = Array.from(new Set(links.map((l) => l.figma_file_key ?? "")));
      const hasPerFile = keys.some((k) => k);

      let changed_story_ids: number[];
      if (hasPerFile) {
        // Per-file drift: each linked file scanned against its own lastModified.
        const entries = await Promise.all(
          keys.map(async (k) => {
            const { lastModified } = await figmaVerifyFile(figma.token, k || figma.fileKey);
            return [k, lastModified] as const;
          }),
        );
        ({ changed_story_ids } = await scanChanges.mutateAsync(Object.fromEntries(entries)));
      } else {
        // Legacy single-file scan (no link carries a file key).
        const { lastModified } = await figmaVerifyFile(figma.token, figma.fileKey);
        ({ changed_story_ids } = await scanChanges.mutateAsync(lastModified));
      }

      toast[changed_story_ids.length ? "warning" : "success"](
        changed_story_ids.length
          ? `${changed_story_ids.length} linked stor${changed_story_ids.length === 1 ? "y has" : "ies have"} design changes`
          : "No design changes since last link.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed.");
    }
  }

  const isConnected = Boolean(figma);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const labelClass = "text-xs text-neutral-500";
  const inputClass = cn(
    "h-9 w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark ? "border-neutral-600 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-800",
  );

  // Is the "Connect with Figma" (OAuth) button available in this deployment?
  useEffect(() => {
    figmaOAuthEnabled().then(setOauthEnabled).catch(() => setOauthEnabled(false));
  }, []);

  async function handleOAuthConnect() {
    setConnecting(true);
    try {
      const state = (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).replace(/-/g, "");
      sessionStorage.setItem(FIGMA_OAUTH_STATE_KEY, state);
      const url = await figmaOAuthAuthorizeUrl(state);
      window.location.assign(url); // leaves the app; returns to /figma/callback
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "Could not start Figma sign-in.");
    }
  }

  // Verify file metadata when the section opens and the user is connected.
  useEffect(() => {
    if (!open || !isConnected || !figma || fileName) return;
    figmaVerifyFile(figma.token, figma.fileKey)
      .then((m) => setFileName(m.name))
      .catch(() => {/* token may have expired — fail silently */});
  }, [open, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSynced = contextFiles.data?.files.find((f) => f.filename === "figma-context.md")?.last_modified;
  const lastSyncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  async function connectFile(token: string, fileKey: string) {
    const meta = await figmaVerifyFile(token, fileKey);
    await saveFigmaConfig.mutateAsync(fileKey);
    setFigma({ token, fileKey });
    setFileName(meta.name);
    setProjectFiles(null);
    toast.success(`Connected to ${meta.name}`);
  }

  async function handleConnect() {
    // OAuth users have a session token already (no PAT typed) → fall back to it.
    const token = tokenInput.trim() || sessionToken;
    const url = urlInput.trim();
    if (!token || !url) {
      toast.error(
        oauthAwaitingFile
          ? "Enter a Figma file or project URL."
          : "Enter a valid Figma token and file or project URL.",
      );
      return;
    }
    setConnecting(true);
    try {
      // Project URL → list its files and let the user pick one (Stage 1 picker).
      const project = parseFigmaProjectUrl(url);
      if (project) {
        try {
          const files = await figmaGetProjectFiles(token, project.projectId);
          if (!files.length) {
            toast.info("No files found in this Figma project.");
          }
          setProjectFiles(files);
        } catch {
          toast.error("Could not list this project. Re-generate your Figma token with the projects:read scope.");
        }
        return;
      }
      // File URL → connect directly, exactly as before.
      const { fileKey } = parseFigmaUrl(url);
      if (!fileKey) {
        toast.error("Enter a valid Figma file or project URL.");
        return;
      }
      await connectFile(token, fileKey);
      setTokenInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to Figma.");
    } finally {
      setConnecting(false);
    }
  }

  async function handlePickFile(file: FigmaProjectFile) {
    setConnecting(true);
    try {
      await connectFile(tokenInput.trim() || sessionToken, file.key);
      setTokenInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to that file.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setFigma({ token: "", fileKey: "" });
    setFileName(null);
    setProjectFiles(null);
    saveFigmaConfig.mutate("");
    toast.info("Figma disconnected.");
  }

  const fileUrl = figma ? `https://www.figma.com/design/${figma.fileKey}` : "#";

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Figma className="size-4" />}
          title="Figma"
          badge={isConnected ? (fileName ?? figma!.fileKey) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("space-y-3 px-4 py-3", expandedPanelClass)}>
            {isConnected ? (
              <>
                <div className={cn("rounded-lg border p-3 space-y-2",
                  dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50",
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("truncate text-sm font-semibold hover:underline",
                        dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-600",
                      )}
                    >
                      {fileName ?? figma!.fileKey}
                    </a>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-neutral-500 hover:text-violet-400">
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  <div className={cn("pt-1 border-t text-xs flex items-center justify-between",
                    dark ? "border-neutral-700 text-neutral-500" : "border-slate-200 text-slate-400",
                  )}>
                    <span>{lastSyncedLabel ? `Last synced ${lastSyncedLabel}` : "Not synced yet"}</span>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      lastSyncedLabel
                        ? (dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700")
                        : (dark ? "bg-yellow-900/40 text-yellow-400" : "bg-yellow-50 text-yellow-700"),
                    )}>
                      {lastSyncedLabel ? "Synced" : "Pending"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                    disabled={syncContext.isPending}
                    onClick={() => syncContext.mutate(undefined, {
                      onSuccess: () => toast.success("Figma context synced."),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed."),
                    })}
                  >
                    <RefreshCw className={cn("size-3.5", syncContext.isPending && "animate-spin")} />
                    {syncContext.isPending ? "Syncing…" : "Sync Context"}
                  </button>
                  <button
                    className={cn("inline-flex h-9 items-center justify-center rounded border text-sm transition-colors",
                      dark ? "border-neutral-600 text-neutral-400 hover:border-red-500/50 hover:text-red-400" : "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-500",
                    )}
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </button>
                </div>

                <button
                  className={cn("inline-flex h-9 w-full items-center justify-center gap-2 rounded border text-sm transition-colors disabled:opacity-50",
                    dark ? "border-neutral-600 text-neutral-300 hover:border-violet-500/50 hover:text-violet-300" : "border-slate-300 text-slate-600 hover:border-violet-300 hover:text-violet-600",
                  )}
                  disabled={scanChanges.isPending}
                  onClick={handleScanChanges}
                >
                  <RefreshCw className={cn("size-3.5", scanChanges.isPending && "animate-spin")} />
                  {scanChanges.isPending ? "Scanning…" : "Scan for design changes"}
                </button>

                <p className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                  Synced screens are injected into Phase 1 story generation and Phase 2 design automatically.
                </p>
              </>
            ) : projectFiles !== null ? (
              <>
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>
                    Pick a file ({projectFiles.length})
                  </p>
                  <button
                    className={cn("text-xs hover:underline", dark ? "text-neutral-400" : "text-slate-500")}
                    onClick={() => setProjectFiles(null)}
                  >
                    Back
                  </button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {projectFiles.map((f) => (
                    <button
                      key={f.key}
                      disabled={connecting}
                      onClick={() => handlePickFile(f)}
                      className={cn("flex w-full items-center gap-2 rounded border p-2 text-left transition-colors disabled:opacity-50",
                        dark ? "border-neutral-700 hover:border-violet-500/50 hover:bg-neutral-900/60" : "border-slate-200 hover:border-violet-300 hover:bg-slate-50",
                      )}
                    >
                      {f.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.thumbnail_url} alt="" className="size-9 shrink-0 rounded object-cover" />
                      ) : (
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded", dark ? "bg-neutral-800" : "bg-slate-100")}>
                          <Figma className="size-4 text-neutral-500" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", dark ? "text-neutral-200" : "text-slate-700")}>{f.name}</span>
                        {f.last_modified ? (
                          <span className={cn("block text-[10px]", dark ? "text-neutral-500" : "text-slate-400")}>
                            {new Date(f.last_modified).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={cn("rounded border px-3 py-2 text-xs space-y-0.5",
                  dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 bg-slate-50 text-slate-600",
                )}>
                  <p className={cn("font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>Link your designs</p>
                  <p>AI will reference your real screens and flows when generating stories and designs.</p>
                </div>

                {oauthAwaitingFile ? (
                  <div className={cn("flex items-center gap-2 rounded border px-3 py-2 text-xs",
                    dark ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    <Figma className="size-3.5 shrink-0" />
                    <span>Signed in with Figma — now pick a file or paste a project URL.</span>
                  </div>
                ) : null}

                {/* OAuth: one click, no token to manage. Hidden when not configured. */}
                {oauthEnabled && !oauthAwaitingFile ? (
                  <>
                    <button
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                      disabled={connecting}
                      onClick={handleOAuthConnect}
                    >
                      <Figma className="size-4" />
                      {connecting ? "Redirecting…" : "Connect with Figma"}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-px flex-1", dark ? "bg-neutral-700" : "bg-slate-200")} />
                      <span className={cn("text-[10px] uppercase tracking-wide", dark ? "text-neutral-600" : "text-slate-400")}>or use a token</span>
                      <span className={cn("h-px flex-1", dark ? "bg-neutral-700" : "bg-slate-200")} />
                    </div>
                  </>
                ) : null}

                <div className="space-y-1">
                  <label className={labelClass}>Figma file or project URL</label>
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className={inputClass}
                    placeholder="https://www.figma.com/design/… or /files/project/…"
                    onKeyDown={(e) => { if (e.key === "Enter" && oauthAwaitingFile) handleConnect(); }}
                    autoComplete="off"
                  />
                </div>
                {oauthAwaitingFile ? null : (
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs text-neutral-500">
                      <span>Personal Access Token</span>
                      <a
                        href="https://www.figma.com/developers/api#access-tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("hover:underline", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-500")}
                      >
                        Generate token
                      </a>
                    </label>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className={inputClass}
                      placeholder="figd_…"
                      onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
                      autoComplete="off"
                    />
                  </div>
                )}
                <p className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                  A project URL lists its files to pick from (token needs the <code>projects:read</code> scope).
                </p>
                <button
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-neutral-800 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
                  disabled={connecting || !urlInput.trim() || (!oauthAwaitingFile && !tokenInput.trim())}
                  onClick={handleConnect}
                >
                  <Figma className="size-4" />
                  {connecting ? "Connecting…" : oauthAwaitingFile ? "Use this file" : "Connect Figma"}
                </button>

                {oauthAwaitingFile ? (
                  <button
                    className={cn("w-full text-center text-[11px] hover:underline", dark ? "text-neutral-500" : "text-slate-400")}
                    onClick={handleDisconnect}
                  >
                    Sign out of Figma
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
