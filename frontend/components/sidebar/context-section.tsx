"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, Download, FileText, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAiConfig,
  useContextFiles,
  useRebuildStoryIndex,
  useResetAllContextFiles,
  useResetContextFile,
  useUpdateContextFile,
} from "@/lib/hooks/use-workspace";
import { useGenerateConstraints } from "@/lib/hooks/use-phase1";
import { Callout } from "@/components/ui/primitives";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/utils/zip";
import { SignInRequired } from "@/components/sign-in-required";
import { MarkdownPreview, PanelHeader, type DragSectionProps } from "./shared";
import { ContextGuideDialog } from "./context-guide";

// ── utilities ─────────────────────────────────────────────────────────────────

// DESIGN.md canonical status tokens (Ledger Green/Caution Amber/Ledger Red),
// not decorative — this is a real safe/caution/danger size gauge.
function contextSizeColor(totalChars: number, dark: boolean): string {
  if (totalChars < 30_000) return dark ? "#34d399" : "#10b981";
  if (totalChars < 80_000) return dark ? "#fbbf24" : "#f59e0b";
  return dark ? "#f87171" : "#dc2626";
}

// Fallback used while /ai-config hasn't loaded yet, or for a model missing
// context_window_tokens — Claude's 200k window was the number these were
// originally (silently) tuned against, so it's the safest default.
const _FALLBACK_CONTEXT_WINDOW_TOKENS = 200_000;

// Chars-per-raw-context-token: at ~4 chars/token, reserving ~75% of the
// window for system prompt + phase instructions + schemas + output (only
// ~25% left for the injected context files) works out to ~1 char of context
// budget per token of window — this reproduces the original hardcoded
// 200k/150k Claude thresholds exactly when context_window_tokens is 200k,
// so it's a drop-in generalization, not a re-tune.
const _CONTEXT_CHAR_BUDGET_PER_WINDOW_TOKEN = 1.0;
const _WARN_FRACTION = 0.75;

function ContextSizeWarning({
  totalChars,
  modelLabel,
  contextWindowTokens,
}: {
  totalChars: number;
  modelLabel: string;
  contextWindowTokens: number;
}) {
  const windowTokens = contextWindowTokens || _FALLBACK_CONTEXT_WINDOW_TOKENS;
  const hardLimit = windowTokens * _CONTEXT_CHAR_BUDGET_PER_WINDOW_TOKEN;
  const warnLimit = hardLimit * _WARN_FRACTION;
  if (totalChars >= hardLimit) {
    return (
      <div className="mb-3">
        <Callout variant="danger">
          <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — exceeds {modelLabel}&apos;s ~{Math.round(hardLimit / 1000)}k char budget for this project. AI calls will fail. Delete or reset context files.
        </Callout>
      </div>
    );
  }
  if (totalChars >= warnLimit) {
    return (
      <div className="mb-3">
        <Callout variant="warning">
          <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — approaching {modelLabel}&apos;s ~{Math.round(hardLimit / 1000)}k char budget. Consider trimming context files.
        </Callout>
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
//
// functional-spec.md is listed everywhere: Phase 1 authors it (locked Gherkin
// per story), and every other phase's service reads it per-story via
// context.story_gherkin(story_id) — Phase 2 (design), Phase 3 (task packs),
// Phase 4 (test plans), Phase 5 (deploy gate), and Phase 6 (maintenance) all
// ground their AI calls on the story's locked acceptance criteria.
//
// technical-spec.md follows the same pattern from Phase 2 onward: Phase 2
// authors it (persist_design) and reads it back for delta/relock checks;
// Phases 3-6 each read it per-story via context.story_technical_spec(story_id)
// to ground task packs, test plans, the deploy gate, and maintenance triage.
//
// runtime-spec.md (optional — only present once generated in Phase 2's Runtime
// Contract section) is project-wide, not per-story: Phase 2 authors + relocks
// it; Phase 3 injects it whole into task decomposition and developer-pack
// generation (generate_tasks / generate_proposal) so packs are grounded in the
// actual scaffold (paths, migration command, session bootstrap) instead of
// guessing; Phase 6 probes it deterministically against synced code for the
// RuntimeConformance dimension. Not read by Phase 4 (test plans) or Phase 5
// (deploy gate) yet.
const CONTEXT_FILE_PHASES: Record<string, string[]> = {
  // phase1_service: project_concept, tech-stack, constraints, figma-context; authors functional-spec
  "/phase1": ["project-concept.md", "tech-stack.md", "functional-spec.md", "constraints.md", "figma-context.md"],
  // phase2_service: project_concept, tech-stack, github-context, figma-context, design-bundle, per-story functional-spec;
  // authors + reads back technical-spec (delta dedup/relock checks) and runtime-spec (independent relock checks)
  "/phase2": ["project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md", "design-bundle.md", "runtime-spec.md", "github-context.md", "figma-context.md"],
  // phase3_service (task decomposition + developer packs): project_concept, tech-stack, design-bundle, runtime-spec,
  // github-context, constraints, decisions, per-story functional-spec + technical-spec
  "/phase3": ["project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md", "design-bundle.md", "runtime-spec.md", "github-context.md", "constraints.md", "decisions.md"],
  // phase4_service (QA test plan): tech-stack, constraints, figma-context, github-context, per-story functional-spec + technical-spec
  "/phase4": ["tech-stack.md", "functional-spec.md", "technical-spec.md", "constraints.md", "figma-context.md", "github-context.md"],
  // phase5_service (deploy/infra): tech-stack, github-context, per-story functional-spec + technical-spec
  "/phase5": ["tech-stack.md", "functional-spec.md", "technical-spec.md", "github-context.md"],
  // phase6_service (maintenance + conformance): tech-stack, constraints, runtime-spec (RuntimeConformance probe),
  // github-context (+ Figma comments sync), per-story functional-spec + technical-spec
  "/phase6": ["tech-stack.md", "functional-spec.md", "technical-spec.md", "constraints.md", "runtime-spec.md", "github-context.md", "figma-context.md"],
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
          className={cn(
            "rounded px-2 py-0.5 text-xs",
            mdPreview
              ? "bg-violet-800 text-white"
              : dark
                ? "text-neutral-400 hover:bg-neutral-800"
                : "text-slate-600 hover:bg-slate-100",
          )}
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
  const aiConfig = useAiConfig();
  const rebuildIndex = useRebuildStoryIndex();
  const resetAll = useResetAllContextFiles();

  useEffect(() => {
    if (!contextFiles.isLoading) return;
    const id = toast.loading("Loading project context…");
    return () => { toast.dismiss(id); };
  }, [contextFiles.isLoading]);

  const totalChars = contextFiles.data?.total_chars ?? 0;
  const sizeColor = contextSizeColor(totalChars, dark);
  const visibleFiles = useVisibleContextFiles(contextFiles.data?.files);

  const activeModel = aiConfig.data?.available_models.find((m) => m.id === aiConfig.data?.model);
  const activeModelLabel = activeModel?.label ?? aiConfig.data?.model ?? "the current model";
  const activeModelContextWindow = activeModel?.context_window_tokens ?? 0;

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
            <ContextSizeWarning totalChars={totalChars} modelLabel={activeModelLabel} contextWindowTokens={activeModelContextWindow} />
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
                          "rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums",
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
