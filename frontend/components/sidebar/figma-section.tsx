"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Figma, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSaveFigmaConfig, useSyncFigmaContext, useContextFiles } from "@/lib/hooks/use-workspace";
import { useSessionStore, useFigmaContext } from "@/lib/stores/session-store";
import { figmaVerifyFile, parseFigmaUrl } from "@/lib/api/figma";
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

  const setFigma = useSessionStore((s) => s.setFigma);
  const figma = useFigmaContext();
  const saveFigmaConfig = useSaveFigmaConfig();
  const syncContext = useSyncFigmaContext();
  const contextFiles = useContextFiles();

  const isConnected = Boolean(figma);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const labelClass = "text-xs text-neutral-500";
  const inputClass = cn(
    "h-9 w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark ? "border-neutral-600 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-800",
  );

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

  async function handleConnect() {
    const token = tokenInput.trim();
    const { fileKey } = parseFigmaUrl(urlInput.trim());
    if (!token || !fileKey) {
      toast.error("Enter a valid Figma token and file URL.");
      return;
    }
    setConnecting(true);
    try {
      const meta = await figmaVerifyFile(token, fileKey);
      await saveFigmaConfig.mutateAsync(fileKey);
      setFigma({ token, fileKey });
      setFileName(meta.name);
      toast.success(`Connected to ${meta.name}`);
      setTokenInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to Figma.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setFigma({ token: "", fileKey: "" });
    setFileName(null);
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

                <p className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                  Synced screens are injected into Phase 1 story generation and Phase 2 design automatically.
                </p>
              </>
            ) : (
              <>
                <div className={cn("rounded border px-3 py-2 text-xs space-y-0.5",
                  dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 bg-slate-50 text-slate-600",
                )}>
                  <p className={cn("font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>Link your designs</p>
                  <p>AI will reference your real screens and flows when generating stories and designs.</p>
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Figma file URL</label>
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className={inputClass}
                    placeholder="https://www.figma.com/design/…"
                    autoComplete="off"
                  />
                </div>
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
                <button
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-neutral-800 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
                  disabled={connecting || !tokenInput.trim() || !urlInput.trim()}
                  onClick={handleConnect}
                >
                  <Figma className="size-4" />
                  {connecting ? "Connecting…" : "Connect Figma"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
