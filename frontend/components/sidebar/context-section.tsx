"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, Download, FileText, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useContextFiles,
  useRebuildStoryIndex,
  useResetAllContextFiles,
  useResetContextFile,
  useUpdateContextFile,
} from "@/lib/hooks/use-workspace";
import { useGenerateConstraints } from "@/lib/hooks/use-phase1";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/utils/zip";
import { SignInRequired } from "@/components/sign-in-required";
import { MarkdownPreview, PanelHeader, type DragSectionProps } from "./shared";
import { ContextGuideDialog } from "./context-guide";

// ── utilities ─────────────────────────────────────────────────────────────────

function contextSizeColor(totalChars: number): string {
  if (totalChars < 30_000) return "#4ade80";
  if (totalChars < 80_000) return "#facc15";
  return "#f87171";
}

function ContextSizeWarning({ totalChars }: { totalChars: number }) {
  if (totalChars >= 200_000) {
    return (
      <div className="mb-3 rounded border border-red-600 bg-red-950/50 px-3 py-2 text-xs text-red-300">
        <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — exceeds Claude&apos;s limit. AI calls will fail. Delete or reset context files.
      </div>
    );
  }
  if (totalChars >= 150_000) {
    return (
      <div className="mb-3 rounded border border-orange-700 bg-orange-950/30 px-3 py-2 text-xs text-orange-300">
        <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — approaching Claude&apos;s limit. Consider trimming context files.
      </div>
    );
  }
  return null;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(diff / 86_400_000);
  return `${days}d ago`;
}

// Each entry lists the context files the corresponding phase service actually
// reads + injects into its AI prompts — keep this in lock-step with the backend
// phaseN_service reads so the "Active Context" panel reflects what really grounds
// the phase (no phantom files, no missed ones).
const CONTEXT_FILE_PHASES: Record<string, string[]> = {
  // phase1_service: project_concept, tech-stack, constraints, figma-context
  "/phase1": ["project-concept.md", "tech-stack.md", "constraints.md", "figma-context.md"],
  // phase2_service: project_concept, tech-stack, github-context, figma-context, design-bundle
  "/phase2": ["project-concept.md", "tech-stack.md", "design-bundle.md", "github-context.md", "figma-context.md"],
  // phase3_service (task decomposition): project_concept, tech-stack, design-bundle, github-context, constraints, decisions
  "/phase3": ["project-concept.md", "tech-stack.md", "design-bundle.md", "github-context.md", "constraints.md", "decisions.md"],
  // phase4_service (QA test plan): tech-stack, constraints, figma-context
  "/phase4": ["tech-stack.md", "constraints.md", "figma-context.md"],
  // phase5_service (deploy/infra): tech-stack, technical-spec, github-context
  "/phase5": ["tech-stack.md", "technical-spec.md", "github-context.md"],
  // phase6_service (maintenance): tech-stack, constraints, github-context (+ Figma comments sync)
  "/phase6": ["tech-stack.md", "constraints.md", "github-context.md", "figma-context.md"],
};

function useVisibleContextFiles(
  files: Array<{ filename: string; label: string; content: string; chars: number; last_modified?: string | null; version?: string }> | undefined,
) {
  const pathname = usePathname();
  return useMemo(() => {
    if (!files) return [];
    const allowed = CONTEXT_FILE_PHASES[pathname];
    if (!allowed) return files;
    return files.filter((f) => allowed.includes(f.filename));
  }, [files, pathname]);
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadContextZip(files: Array<{ filename: string; content: string }>) {
  if (!files.length) { toast.error("No context files to download"); return; }
  downloadZip(files, "apex-context-files.zip");
}

function ContextEditor({
  file,
  onConfirm,
}: {
  file: { filename: string; label: string; content: string };
  onConfirm: (msg: string, cb: () => void) => void;
}) {
  const [value, setValue] = useState(file.content);
  const [mdPreview, setMdPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useUpdateContextFile();
  const reset = useResetContextFile();
  const genConstraints = useGenerateConstraints();
  const isConstraints = file.filename === "constraints.md";
  const dark = useUiStore((state) => state.theme) === "dark";

  function handleGenerateConstraints() {
    genConstraints.mutate(undefined, {
      onSuccess: (res) => {
        setValue(res.constraints_md);
        update.mutate(
          { filename: file.filename, content: res.constraints_md },
          { onError: () => toast.error(`Failed to save ${file.label}`) },
        );
        toast.success(`Generated ${res.constraints.length} constraints`);
      },
      onError: () => toast.error("Failed to generate constraints. Try again."),
    });
  }

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setValue(file.content);
  }, [file.content]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleChange(newValue: string) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      update.mutate(
        { filename: file.filename, content: newValue },
        { onError: () => toast.error(`Failed to save ${file.label}`) },
      );
    }, 700);
  }

  const statusLabel = update.isPending ? "Saving…" : update.isError ? "Error" : update.isSuccess ? "Saved" : "";
  const statusColor = update.isError ? "text-red-400" : dark ? "text-neutral-500" : "text-slate-500";

  return (
    <div className={cn("border-t", dark ? "border-neutral-800" : "border-slate-200")}>
      <div className={cn("flex items-center gap-2 border-b px-3 py-1", dark ? "border-neutral-800" : "border-slate-200")}>
        <span className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{value.length} ch</span>
        {statusLabel ? <span className={cn("text-xs", statusColor)}>{statusLabel}</span> : null}
        <div className="flex-1" />
        {isConstraints ? (
          <button
            className="flex items-center gap-1 rounded bg-violet-700 px-2 py-0.5 text-xs font-semibold text-violet-50 hover:bg-violet-600 disabled:opacity-50"
            disabled={genConstraints.isPending}
            onClick={handleGenerateConstraints}
          >
            <Sparkles className="size-3" /> {genConstraints.isPending ? "Generating…" : "Generate with AI"}
          </button>
        ) : null}
        <button
          className={cn("rounded px-2 py-0.5 text-xs", mdPreview ? "bg-violet-800 text-violet-100" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100")}
          onClick={() => setMdPreview(!mdPreview)}
        >
          {mdPreview ? "Raw" : "Preview"}
        </button>
      </div>
      {mdPreview ? (
        <MarkdownPreview content={value} />
      ) : (
        <textarea
          className={cn("h-56 w-full resize-y p-3 font-mono text-xs leading-5 outline-none", dark ? "bg-neutral-950 text-neutral-200" : "bg-white text-slate-800")}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
      <div className="grid grid-cols-2 gap-2 p-2">
        <button
          className={cn("flex h-8 items-center justify-center gap-1 rounded text-xs", dark ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
          onClick={() => downloadFile(file.filename, value)}
        >
          <Download className="size-3" /> Download
        </button>
        <button
          className="h-8 rounded bg-red-950/70 text-xs font-semibold text-red-300 disabled:opacity-50"
          disabled={reset.isPending}
          onClick={() => onConfirm(`Reset ${file.label} to default?`, () => reset.mutate(file.filename, {
            onSuccess: () => toast.success(`${file.label} reset to default`),
            onError: () => toast.error(`Failed to reset ${file.label}`),
          }))}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

// ── ContextSection ────────────────────────────────────────────────────────────

type ContextSectionProps = DragSectionProps & {
  dark: boolean;
  projectId: number;
  confirm: (msg: string, cb: () => void) => void;
};

export function ContextSection({ dark, projectId: _projectId, confirm, shellClass, dragHandlers, onDragStart }: ContextSectionProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const context = useApiContext();
  const contextFiles = useContextFiles();
  const rebuildIndex = useRebuildStoryIndex();
  const resetAll = useResetAllContextFiles();

  useEffect(() => {
    if (!contextFiles.isLoading) return;
    const id = toast.loading("Loading project context…");
    return () => { toast.dismiss(id); };
  }, [contextFiles.isLoading]);

  const totalChars = contextFiles.data?.total_chars ?? 0;
  const sizeColor = contextSizeColor(totalChars);
  const visibleFiles = useVisibleContextFiles(contextFiles.data?.files);

  const projectConcept = contextFiles.data?.files.find((f) => f.filename === "project-concept.md")?.content ?? "";
  const hasProjectConcept = useMemo(() => {
    const text = projectConcept.replace(/^#[^\n]*\n/, "").trim();
    return Boolean(text) && !text.startsWith("<!--");
  }, [projectConcept]);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<FileText className="size-4" />}
          title="Active Context"
          badge={context ? `${totalChars} ch` : "—"}
          open={contextOpen}
          onClick={() => setContextOpen(!contextOpen)}
          onDragStart={onDragStart}
        />
        {contextOpen ? (
          <div className={cn("px-4 py-4", expandedPanelClass)}>
            {!context ? (
              <SignInRequired unlocks="the project context" />
            ) : (
            <>
            <div className={cn("mb-3 text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
              context:{" "}
              <span className="font-bold" style={{ color: sizeColor }}>
                {totalChars} chars
              </span>
            </div>
            <ContextSizeWarning totalChars={totalChars} />
            {!hasProjectConcept && contextFiles.data ? (
              <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                Project Concept file is empty. Fill it in for best AI results.
              </div>
            ) : null}
            <div className="mb-4 space-y-3">
              {visibleFiles.map((file) => (
                <div
                  key={file.filename}
                  className={cn(
                    "group rounded-md border transition-all duration-200 ease-out",
                    dark
                      ? "border-neutral-700 bg-[#17181d] hover:border-violet-500/60 hover:bg-[#232638] hover:shadow-[0_0_0_1px_rgba(139,92,246,0.22)]"
                      : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-sm",
                  )}
                >
                  <button
                    className="flex h-10 w-full items-center gap-3 px-4 text-left transition-colors duration-200"
                    onClick={() => setExpandedContext(expandedContext === file.filename ? null : file.filename)}
                  >
                    <ChevronRight className={cn(
                      "size-3 transition-all duration-200 group-hover:text-violet-400",
                      dark ? "text-neutral-500" : "text-slate-400",
                      expandedContext === file.filename && "rotate-90 text-violet-400",
                    )} />
                    <FileText className="size-4 text-violet-400 transition-colors duration-200 group-hover:text-violet-300" />
                    <span className={cn("flex-1 text-sm font-medium transition-colors duration-200", dark ? "text-white group-hover:text-violet-100" : "text-slate-950 group-hover:text-violet-900")}>
                      {file.label}
                    </span>
                    {file.version && file.version !== "0.0.0" ? (
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          dark ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-600",
                        )}
                        title="Semver: MAJOR bumps on every post-lock amendment"
                      >
                        v{file.version}
                      </span>
                    ) : null}
                    <span className={cn("text-xs transition-colors duration-200", dark ? "text-neutral-500 group-hover:text-violet-300" : "text-slate-500 group-hover:text-violet-600")}>
                      {file.chars} ch
                      {relativeTime(file.last_modified) ? (
                        <span className="ml-1.5 opacity-60">· {relativeTime(file.last_modified)}</span>
                      ) : null}
                    </span>
                  </button>
                  {expandedContext === file.filename ? (
                    <ContextEditor file={file} onConfirm={confirm} />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                onClick={() => setGuideOpen(true)}
              >
                <span>Context guide — rules &amp; format</span>
                <BookOpen className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={contextFiles.isFetching}
                onClick={() => { contextFiles.refetch(); toast.info("Context reloaded"); }}
              >
                <span>Reload context</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={!contextFiles.data?.files.length}
                onClick={() => { downloadContextZip(contextFiles.data?.files ?? []); toast.success("Context ZIP downloaded"); }}
              >
                <span>Download all context files</span>
                <Download className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={rebuildIndex.isPending}
                onClick={() => rebuildIndex.mutate(undefined, {
                  onSuccess: () => toast.success("Story index rebuilt"),
                  onError: () => toast.error("Failed to rebuild story index"),
                })}
              >
                <span>Rebuild story index</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-red-500/30 px-3 text-sm transition-colors hover:border-red-500/60 hover:bg-red-500/15 disabled:opacity-40",
                  dark ? "text-red-400 hover:text-red-300" : "text-red-600 hover:text-red-700",
                )}
                disabled={resetAll.isPending}
                onClick={() => confirm("Reset ALL context files to defaults? This cannot be undone.", () => resetAll.mutate(undefined, { onSuccess: () => toast.success("All context files reset"), onError: () => toast.error("Failed to reset context files") }))}
              >
                <span>Reset all context files</span>
                <Trash2 className="size-4" />
              </button>
            </div>
            </>
            )}
          </div>
        ) : null}
      </section>
      <ContextGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} dark={dark} />
    </div>
  );
}
