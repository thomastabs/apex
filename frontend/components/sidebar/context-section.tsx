"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Bot, ChevronRight, Download, FileText, RefreshCw, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useAiConfig,
  useAgentFiles,
  useContextFiles,
  useContextWikiStatus,
  usePublishContextToWiki,
  usePullContextFromWiki,
  useRebuildStoryIndex,
  useResetAllContextFiles,
  useResetContextFile,
  useUpdateContextFile,
  useUpdateAgentFile,
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
import { useT } from "@/lib/i18n/use-translation";

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
  const t = useT();
  const windowTokens = contextWindowTokens || _FALLBACK_CONTEXT_WINDOW_TOKENS;
  const hardLimit = windowTokens * _CONTEXT_CHAR_BUDGET_PER_WINDOW_TOKEN;
  const warnLimit = hardLimit * _WARN_FRACTION;
  if (totalChars >= hardLimit) {
    return (
      <div className="mb-3">
        <Callout variant="danger">
          {t("context.exceedsBudget", { k: Math.round(totalChars / 1000), model: modelLabel, limit: Math.round(hardLimit / 1000) })}
        </Callout>
      </div>
    );
  }
  if (totalChars >= warnLimit) {
    return (
      <div className="mb-3">
        <Callout variant="warning">
          {t("context.approachingBudget", { k: Math.round(totalChars / 1000), model: modelLabel, limit: Math.round(hardLimit / 1000) })}
        </Callout>
      </div>
    );
  }
  return null;
}

function relativeTime(iso: string | null | undefined, t: ReturnType<typeof useT>): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 2) return t("context.relativeJustNow");
  if (mins < 60) return t("context.relativeMinsAgo", { n: mins });
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return t("context.relativeHoursAgo", { n: hrs });
  const days = Math.round(diff / 86_400_000);
  return t("context.relativeDaysAgo", { n: days });
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

function downloadContextZip(files: Array<{ filename: string; content: string }>, t: ReturnType<typeof useT>) {
  if (!files.length) { toast.error(t("context.noFilesToDownload")); return; }
  downloadZip(files, "apex-context-files.zip");
}

function AgentFileEditor({
  file,
  dark,
}: {
  file: { filename: string; label: string; content: string; chars: number; exists: boolean; ignored: boolean };
  dark: boolean;
}) {
  const t = useT();
  const [value, setValue] = useState(file.content);
  const update = useUpdateAgentFile();

  useEffect(() => {
    setValue(file.content);
  }, [file.content, file.filename]);

  return (
    <div className={cn("border-t", dark ? "border-neutral-800" : "border-slate-200")}>
      <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
        <span>{value.length} ch</span>
        <span className={cn("rounded border px-1.5 py-0.5", file.ignored ? "border-amber-500/40 text-amber-400" : dark ? "border-neutral-700 text-neutral-400" : "border-slate-300 text-slate-500")}>
          {file.ignored ? t("agentFiles.localOnly") : t("agentFiles.repoVisible")}
        </span>
        {!file.exists ? <span>{t("agentFiles.notCreated")}</span> : null}
      </div>
      <textarea
        className={cn("h-48 w-full resize-y border-y p-3 font-mono text-xs leading-5 outline-none", dark ? "border-neutral-800 bg-neutral-950 text-neutral-200" : "border-slate-200 bg-white text-slate-800")}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2 p-2">
        <button
          className={cn("flex h-8 items-center justify-center gap-1 rounded text-xs", dark ? "bg-violet-700 text-violet-50 hover:bg-violet-600" : "bg-violet-600 text-white hover:bg-violet-700")}
          disabled={update.isPending}
          onClick={() => update.mutate(
            { filename: file.filename, content: value },
            {
              onSuccess: () => toast.success(t("agentFiles.saved", { file: file.filename })),
              onError: () => toast.error(t("agentFiles.saveFailed", { file: file.filename })),
            },
          )}
        >
          <Save className="size-3" /> {update.isPending ? t("common.saving") : t("common.save")}
        </button>
        <button
          className={cn("flex h-8 items-center justify-center gap-1 rounded text-xs", dark ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
          onClick={() => downloadFile(file.filename, value)}
        >
          <Download className="size-3" /> {t("common.download")}
        </button>
      </div>
    </div>
  );
}

function ContextEditor({
  file,
  onConfirm,
}: {
  file: { filename: string; label: string; content: string };
  onConfirm: (msg: string, cb: () => void) => void;
}) {
  const t = useT();
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
          { onError: () => toast.error(t("context.saveFailed", { label: file.label })) },
        );
        toast.success(t("context.constraintsGenerated", { n: res.constraints.length }));
      },
      onError: () => toast.error(t("context.generateConstraintsFailed")),
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
        { onError: () => toast.error(t("context.saveFailed", { label: file.label })) },
      );
    }, 700);
  }

  const statusLabel = update.isPending ? t("common.saving") : update.isError ? t("context.errorStatus") : update.isSuccess ? t("context.savedStatus") : "";
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
            <Sparkles className="size-3" /> {genConstraints.isPending ? t("common.generating") : t("context.generateWithAI")}
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
          {mdPreview ? t("context.raw") : t("common.preview")}
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
          <Download className="size-3" /> {t("common.download")}
        </button>
        <button
          className="h-8 rounded bg-red-950/70 text-xs font-semibold text-red-300 disabled:opacity-50"
          disabled={reset.isPending}
          onClick={() => onConfirm(t("context.resetFileConfirm", { label: file.label }), () => reset.mutate(file.filename, {
            onSuccess: () => toast.success(t("context.fileResetSuccess", { label: file.label })),
            onError: () => toast.error(t("context.fileResetFailed", { label: file.label })),
          }))}
        >
          {t("context.resetToDefault")}
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
  const t = useT();
  const [contextOpen, setContextOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [expandedAgentFile, setExpandedAgentFile] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const context = useApiContext();
  const contextFiles = useContextFiles();
  const wikiStatus = useContextWikiStatus();
  const agentFiles = useAgentFiles();
  const aiConfig = useAiConfig();
  const publishWiki = usePublishContextToWiki();
  const pullWiki = usePullContextFromWiki();
  const rebuildIndex = useRebuildStoryIndex();
  const resetAll = useResetAllContextFiles();

  // Search-result jump target (set by the command palette) — see SearchFocus
  // in ui-store.ts. Consumed once, then cleared.
  const searchFocus = useUiStore((s) => s.searchFocus);
  const clearSearchFocus = useUiStore((s) => s.clearSearchFocus);
  useEffect(() => {
    if (searchFocus?.kind === "file") {
      setContextOpen(true);
      setExpandedContext(searchFocus.filename);
      clearSearchFocus();
    }
  }, [searchFocus, clearSearchFocus]);

  useEffect(() => {
    if (!contextFiles.isLoading) return;
    const id = toast.loading(t("context.loadingContext"));
    return () => { toast.dismiss(id); };
  }, [contextFiles.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalChars = contextFiles.data?.total_chars ?? 0;
  const sizeColor = contextSizeColor(totalChars, dark);
  const visibleFiles = useVisibleContextFiles(contextFiles.data?.files);

  const activeModel = aiConfig.data?.available_models.find((m) => m.id === aiConfig.data?.model);
  const activeModelLabel = activeModel?.label ?? aiConfig.data?.model ?? t("context.currentModelFallback");
  const activeModelContextWindow = activeModel?.context_window_tokens ?? 0;
  const wikiPages = wikiStatus.data?.pages ?? [];
  const wikiPageCount = wikiPages.filter((page) => page.exists).length;
  const wikiTotalCount = wikiPages.length || visibleFiles.length;

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
          title={t("context.panelTitle")}
          badge={context ? `${totalChars} ch` : "—"}
          open={contextOpen}
          onClick={() => setContextOpen(!contextOpen)}
          onDragStart={onDragStart}
        />
        {contextOpen ? (
          <div className={cn("px-4 py-4", expandedPanelClass)}>
            {!context ? (
              <SignInRequired unlocks={t("context.unlocksContext")} />
            ) : (
            <>
            <div className={cn("mb-3 text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
              {t("context.contextLabel")}{" "}
              <span className="font-bold" style={{ color: sizeColor }}>
                {t("context.charsSuffix", { n: totalChars })}
              </span>
            </div>
            <ContextSizeWarning totalChars={totalChars} modelLabel={activeModelLabel} contextWindowTokens={activeModelContextWindow} />
            {!hasProjectConcept && contextFiles.data ? (
              <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                {t("context.emptyProjectConcept")}
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
                        title={t("context.semverTooltip")}
                      >
                        v{file.version}
                      </span>
                    ) : null}
                    <span className={cn("text-xs transition-colors duration-200", dark ? "text-neutral-500 group-hover:text-violet-300" : "text-slate-500 group-hover:text-violet-600")}>
                      {file.chars} ch
                      {relativeTime(file.last_modified, t) ? (
                        <span className="ml-1.5 opacity-60">· {relativeTime(file.last_modified, t)}</span>
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
                <span>{t("context.contextGuide")}</span>
                <BookOpen className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={contextFiles.isFetching}
                onClick={() => { contextFiles.refetch(); toast.info(t("context.contextReloaded")); }}
              >
                <span>{t("context.reloadContext")}</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={!contextFiles.data?.files.length}
                onClick={() => { downloadContextZip(contextFiles.data?.files ?? [], t); toast.success(t("context.contextZipDownloaded")); }}
              >
                <span>{t("context.downloadAllContextFiles")}</span>
                <Download className="size-4 text-violet-400" />
              </button>
              {context?.pmTool === "taiga" ? (
                <div className={cn("rounded border px-3 py-2", dark ? "border-neutral-700 bg-neutral-950/40" : "border-slate-200 bg-slate-50")}>
                  <div className={cn("mb-2 flex items-center justify-between text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
                    <span>{t("context.taigaWikiStatus")}</span>
                    <span className={cn("font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>
                      {wikiStatus.isFetching ? t("common.loading") : t("context.taigaWikiCount", { existing: wikiPageCount, total: wikiTotalCount })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={cn(
                        "flex h-8 items-center justify-center gap-1 rounded text-xs font-semibold disabled:opacity-40",
                        dark ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700" : "bg-white text-slate-700 hover:bg-slate-100",
                      )}
                      disabled={publishWiki.isPending || !contextFiles.data?.files.length}
                      onClick={() => publishWiki.mutate([], {
                        onSuccess: () => toast.success(t("context.taigaWikiPublished")),
                        onError: (e) => toast.error(e instanceof Error ? e.message : t("context.taigaWikiPublishFailed")),
                      })}
                    >
                      <Upload className="size-3" /> {publishWiki.isPending ? t("common.saving") : t("context.publishToTaigaWiki")}
                    </button>
                    <button
                      className={cn(
                        "flex h-8 items-center justify-center gap-1 rounded text-xs font-semibold disabled:opacity-40",
                        dark ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700" : "bg-white text-slate-700 hover:bg-slate-100",
                      )}
                      disabled={pullWiki.isPending}
                      onClick={() => confirm(t("context.taigaWikiPullConfirm"), () => pullWiki.mutate([], {
                        onSuccess: () => toast.success(t("context.taigaWikiPulled")),
                        onError: (e) => toast.error(e instanceof Error ? e.message : t("context.taigaWikiPullFailed")),
                      }))}
                    >
                      <Download className="size-3" /> {pullWiki.isPending ? t("common.loading") : t("context.pullFromTaigaWiki")}
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                  dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                )}
                disabled={rebuildIndex.isPending}
                onClick={() => rebuildIndex.mutate(undefined, {
                  onSuccess: () => toast.success(t("board.storyIndexRebuilt")),
                  onError: () => toast.error(t("board.storyIndexRebuildFailed")),
                })}
              >
                <span>{t("context.rebuildStoryIndex")}</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded border border-red-500/30 px-3 text-sm transition-colors hover:border-red-500/60 hover:bg-red-500/15 disabled:opacity-40",
                  dark ? "text-red-400 hover:text-red-300" : "text-red-600 hover:text-red-700",
                )}
                disabled={resetAll.isPending}
                onClick={() => confirm(t("context.resetAllConfirm"), () => resetAll.mutate(undefined, { onSuccess: () => toast.success(t("context.allContextFilesReset")), onError: () => toast.error(t("context.resetContextFilesFailed")) }))}
              >
                <span>{t("context.resetAllContextFiles")}</span>
                <Trash2 className="size-4" />
              </button>
            </div>
            </>
            )}
          </div>
        ) : null}
      </section>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Bot className="size-4" />}
          title={t("agentFiles.panelTitle")}
          badge={context ? `${agentFiles.data?.files?.filter((file) => file.exists).length ?? 0}` : "—"}
          open={agentOpen}
          onClick={() => setAgentOpen(!agentOpen)}
          onDragStart={onDragStart}
        />
        {agentOpen ? (
          <div className={cn("px-4 py-4", expandedPanelClass)}>
            {!context ? (
              <SignInRequired unlocks={t("agentFiles.unlocks")} />
            ) : (
              <>
                <p className={cn("mb-3 text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
                  {t("agentFiles.desc")}
                </p>
                <div className="mb-4 space-y-3">
                  {(agentFiles.data?.files ?? []).map((file) => (
                    <div
                      key={file.filename}
                      className={cn(
                        "group rounded-md border transition-all duration-200 ease-out",
                        dark
                          ? "border-neutral-700 bg-[#17181d] hover:border-violet-500/60 hover:bg-[#232638]"
                          : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/70",
                      )}
                    >
                      <button
                        className="flex h-10 w-full items-center gap-3 px-4 text-left transition-colors duration-200"
                        onClick={() => setExpandedAgentFile(expandedAgentFile === file.filename ? null : file.filename)}
                      >
                        <ChevronRight className={cn("size-3 transition-all duration-200 group-hover:text-violet-400", dark ? "text-neutral-500" : "text-slate-400", expandedAgentFile === file.filename && "rotate-90 text-violet-400")} />
                        <FileText className="size-4 text-violet-400" />
                        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", dark ? "text-white" : "text-slate-950")}>
                          {file.label}
                        </span>
                        <span className="font-mono text-xs opacity-70">{file.filename}</span>
                      </button>
                      {expandedAgentFile === file.filename ? (
                        <AgentFileEditor file={file} dark={dark} />
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <button
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                      dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                    )}
                    disabled={agentFiles.isFetching}
                    onClick={() => { agentFiles.refetch(); toast.info(t("agentFiles.reloaded")); }}
                  >
                    <span>{t("agentFiles.reload")}</span>
                    <RefreshCw className="size-4 text-violet-400" />
                  </button>
                  <button
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 disabled:opacity-40",
                      dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-800",
                    )}
                    disabled={!agentFiles.data?.files.length}
                    onClick={() => {
                      downloadZip(
                        (agentFiles.data?.files ?? []).map((file) => ({ filename: file.filename, content: file.content })),
                        "apex-agent-files.zip",
                      );
                      toast.success(t("agentFiles.downloaded"));
                    }}
                  >
                    <span>{t("agentFiles.downloadAll")}</span>
                    <Download className="size-4 text-violet-400" />
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
