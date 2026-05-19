"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Code2, Compass, Info, RefreshCw, RotateCcw, Save, Sparkles, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import {
  useEligiblePhase2Epics,
  useGenerateDesignBundle,
  useLockEpicDesign,
  useLockTechStack,
  useProposeTechStack,
  useRefreshStoryIndex,
  useTechStackStatus,
} from "@/lib/hooks/use-phase2";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { MermaidBlock } from "@/components/mermaid-block";
import { cn } from "@/lib/utils";

type BundleTab = "ux" | "architecture";

const TREE_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#fb923c"];

function ComponentTreeView({ content, dark }: { content: string; dark: boolean }) {
  if (!content.trim()) return null;
  const lines = content.split("\n");
  const rows: React.ReactNode[] = [];
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;
    const spaces = line.length - line.trimStart().length;
    const depth = Math.floor(spaces / 2);
    const color = TREE_COLORS[depth % TREE_COLORS.length];
    const icon = depth === 0 ? "◆" : "└─";
    rows.push(
      <div
        key={rows.length}
        style={{ paddingLeft: depth * 20, display: "flex", alignItems: "baseline", lineHeight: 1.65, padding: "2px 8px" }}
      >
        <span style={{ color, marginRight: 5, fontSize: 10, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: dark ? "#e5e5e5" : "#1e293b" }}>{stripped}</span>
      </div>,
    );
  }
  if (!rows.length) return null;
  return (
    <div style={{ padding: "10px 6px", background: dark ? "#111" : "#f8fafc", borderRadius: 6, overflowY: "auto" }}>
      {rows}
    </div>
  );
}

function draftKey(projectId: number | null, epicId: number | null) {
  return `apex-phase2-draft-${projectId ?? "none"}-${epicId ?? "none"}`;
}

function saveBundleDraft(projectId: number | null, epicId: number | null, bundle: object | null) {
  if (typeof window === "undefined") return;
  if (!bundle || !epicId) {
    localStorage.removeItem(draftKey(projectId, epicId));
  } else {
    localStorage.setItem(draftKey(projectId, epicId), JSON.stringify(bundle));
  }
}

function loadBundleDraft(projectId: number | null, epicId: number | null): object | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(projectId, epicId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function Phase2Workflow() {
  const dark = useUiStore((state) => state.theme) === "dark";
  const context = useApiContext();
  const [stackHint, setStackHint] = useState("");
  const [bundleTab, setBundleTab] = useState<BundleTab>("ux");
  const [stackReopened, setStackReopened] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const techStack = useTechStackStatus();
  const eligibleEpics = useEligiblePhase2Epics();
  const proposeStack = useProposeTechStack();
  const lockStack = useLockTechStack();
  const generateBundle = useGenerateDesignBundle();
  const lockDesign = useLockEpicDesign();
  const refreshIndex = useRefreshStoryIndex();

  const {
    alternatives,
    selectedAlternativeIndex,
    techStackDraft,
    selectedEpic,
    designBundle,
    designLeadApproved,
    techLeadApproved,
    setAlternatives,
    setSelectedAlternativeIndex,
    setTechStackDraft,
    setSelectedEpic,
    setDesignBundle,
    setDesignLeadApproved,
    setTechLeadApproved,
  } = usePhase2Store();

  useEffect(() => {
    if (techStack.data?.tech_stack && !techStackDraft) {
      setTechStackDraft(techStack.data.tech_stack);
    }
  }, [setTechStackDraft, techStack.data?.tech_stack, techStackDraft]);

  // Restore bundle draft when epic changes
  useEffect(() => {
    if (!selectedEpic) return;
    const saved = loadBundleDraft(context?.projectId ?? null, selectedEpic.epic_id);
    if (saved && !designBundle) {
      setDesignBundle(saved as Parameters<typeof setDesignBundle>[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEpic?.epic_id]);

  // Persist bundle draft when it changes
  useEffect(() => {
    saveBundleDraft(context?.projectId ?? null, selectedEpic?.epic_id ?? null, designBundle);
  }, [context?.projectId, selectedEpic?.epic_id, designBundle]);

  const stackDefined = Boolean(techStack.data?.defined) && !stackReopened;
  const noContext = !context;
  const busy = proposeStack.isPending || lockStack.isPending || generateBundle.isPending || lockDesign.isPending || refreshIndex.isPending;
  const canSave = Boolean(selectedEpic && designBundle && designLeadApproved && techLeadApproved);

  function clearDesign() {
    setDesignBundle(null);
    setDesignLeadApproved(false);
    setTechLeadApproved(false);
    toast.info("Design cleared");
  }

  function reopenGate0() {
    setStackReopened(true);
    setTechStackDraft(techStack.data?.tech_stack ?? "");
  }

  // theme-aware shared classes
  const sectionBorderClass = dark ? "border-neutral-700" : "border-slate-200";
  const labelClass = dark ? "text-neutral-200" : "text-slate-700";
  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const cardClass = dark ? "border-neutral-800 bg-[#1f1f21]" : "border-slate-200 bg-slate-50";
  const panelHeaderClass = dark ? "border-neutral-800 text-neutral-400" : "border-slate-200 text-slate-500";
  const outlineButtonClass = dark
    ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
    : "border-slate-300 text-slate-600 hover:bg-slate-100";

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 2</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>Design</h1>
        <p className={cn("mt-2", mutedClass)}>
          Design Lead + Tech Lead gate: visual prototype and OpenAPI spec per epic.
        </p>
      </div>

      <div className={cn("mb-6 rounded-md border", dark ? "border-neutral-800" : "border-slate-200")}>
        <button
          className={cn(
            "flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors",
            dark ? "text-neutral-400 hover:text-neutral-300" : "text-slate-500 hover:text-slate-700",
          )}
          onClick={() => setDiagramOpen(!diagramOpen)}
        >
          <ChevronRight className={cn("size-4 transition-transform", diagramOpen && "rotate-90")} />
          <Info className="size-4" />
          <span>View Process Diagram (How this works)</span>
        </button>
        {diagramOpen ? (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/design.svg" alt="Phase 2 design process diagram" className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      {noContext ? (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Sign in required</p>
            <p className="mt-0.5 text-xs text-amber-400/80">Sign in and select a Taiga project in the sidebar to unlock Phase 2 design tools.</p>
          </div>
        </div>
      ) : null}

      <div className={cn("space-y-8 border-t pt-6", sectionBorderClass)}>
        <section className="space-y-4">
          <SectionHeading>Stage A · Tech Stack Definition</SectionHeading>
          {stackDefined ? (
            <div className="flex items-start justify-between gap-4">
              <Callout>Tech Stack is locked for this project. You can review it below before designing epics.</Callout>
              <button
                className={cn("flex shrink-0 items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                title="Reopen tech stack for editing"
                onClick={reopenGate0}
              >
                <Unlock className="size-3" />
                Reopen
              </button>
            </div>
          ) : (
            <Callout>Define and lock the global Tech Stack before Phase 2 design generation.</Callout>
          )}
          <label className={cn("block text-sm font-medium", labelClass)}>
            Tech Lead Guidance <span className={mutedClass}>Optional</span>
            <Input value={stackHint} onChange={(event) => setStackHint(event.target.value)} placeholder="e.g. prefer Python backend, PostgreSQL, simple deployment" />
          </label>
          {!stackDefined ? (
            <Button
              disabled={busy || noContext}
              onClick={() =>
                proposeStack.mutate(
                  { hint: stackHint },
                  {
                    onSuccess: (data) => {
                      setAlternatives(data.alternatives);
                      setSelectedAlternativeIndex(-1);
                      toast.success("Architecture alternatives proposed");
                    },
                  },
                )
              }
            >
              <Sparkles className="size-4" />
              Propose Architecture
            </Button>
          ) : null}
          {proposeStack.isError ? (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              Proposal failed: {String(proposeStack.error)}
            </div>
          ) : null}

          {alternatives.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {alternatives.map((alt, index) => (
                <button
                  key={alt.name}
                  onClick={() => {
                    setSelectedAlternativeIndex(index);
                    setTechStackDraft(`${alt.name}\n\n${alt.description}\n\n${alt.trade_offs}`);
                  }}
                  className={cn(
                    "rounded-md border p-4 text-left transition-colors",
                    dark ? "bg-[#1f1f21]" : "bg-slate-50",
                    selectedAlternativeIndex === index
                      ? "border-violet-500"
                      : dark ? "border-neutral-800 hover:border-neutral-700" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <div className={cn("mb-2 font-semibold", dark ? "text-white" : "text-slate-900")}>
                    Option {index + 1}: {alt.name}
                  </div>
                  <p className={cn("mb-3 text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{alt.description}</p>
                  <pre className={cn("whitespace-pre-wrap text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{alt.trade_offs}</pre>
                </button>
              ))}
            </div>
          ) : null}

          <label className={cn("block text-sm font-medium", labelClass)}>
            Locked Tech Stack Draft
            <Textarea rows={8} value={techStackDraft} onChange={(event) => setTechStackDraft(event.target.value)} />
          </label>
          <Button
            disabled={busy || noContext || !techStackDraft.trim()}
            onClick={() => {
              lockStack.mutate(
                { tech_stack: techStackDraft },
                {
                  onSuccess: () => {
                    setStackReopened(false);
                    toast.success("Tech stack locked to memory bank");
                  },
                },
              );
            }}
          >
            <Save className="size-4" />
            Lock Tech Stack to Memory Bank
          </Button>
          {lockStack.isError ? (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              Lock failed: {String(lockStack.error)}
            </div>
          ) : null}
        </section>

        {stackDefined ? (
          <section className={cn("space-y-5 border-t pt-6", sectionBorderClass)}>
            <SectionHeading>Stage B · Epic Design Bundle</SectionHeading>
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <label className={cn("block text-sm font-medium", labelClass)}>
                  Eligible Epic
                  <select
                    className={cn(
                      "mt-1 h-10 w-full rounded border px-3 text-sm outline-none transition-colors",
                      dark
                        ? "border-neutral-700 bg-neutral-950 text-white hover:border-neutral-500 focus:border-violet-500"
                        : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20",
                    )}
                    value={selectedEpic?.epic_id ?? ""}
                    onChange={(event) => {
                      const epic = eligibleEpics.data?.find((item) => item.epic_id === Number(event.target.value)) ?? null;
                      setSelectedEpic(epic);
                    }}
                  >
                    <option value="">Select an epic...</option>
                    {eligibleEpics.data?.map((epic) => (
                      <option key={epic.epic_id} value={epic.epic_id}>
                        {epic.epic_title} ({epic.story_count} stories)
                        {epic.phase_status === "design_locked" ? " ✓" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={busy || !selectedEpic}
                    onClick={() =>
                      selectedEpic &&
                      generateBundle.mutate(
                        { epic_id: selectedEpic.epic_id },
                        {
                          onSuccess: (bundle) => {
                            setDesignBundle(bundle);
                            toast.success("Design bundle generated");
                          },
                        },
                      )
                    }
                  >
                    <Sparkles className="size-4" />
                    Generate
                  </Button>
                  <button
                    className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors disabled:opacity-40", outlineButtonClass)}
                    disabled={busy}
                    title="Refresh story index from Taiga"
                    onClick={() =>
                      refreshIndex.mutate(undefined, {
                        onSuccess: () => {
                          eligibleEpics.refetch();
                          toast.success("Story index refreshed");
                        },
                      })
                    }
                  >
                    <RefreshCw className="size-3" />
                    Refresh
                  </button>
                  {designBundle ? (
                    <button
                      className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                      title="Clear current design"
                      onClick={clearDesign}
                    >
                      <RotateCcw className="size-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={cn("rounded-md border p-4 text-sm", cardClass, mutedClass)}>
                {selectedEpic ? (
                  <>
                    <div className={cn("font-semibold", dark ? "text-white" : "text-slate-800")}>{selectedEpic.epic_title}</div>
                    <div>{selectedEpic.story_count} locked story/stories available for design.</div>
                    <div className="mt-1 text-xs">
                      Status:{" "}
                      <span className={selectedEpic.phase_status === "design_locked" ? "text-emerald-400" : "text-violet-400"}>
                        {selectedEpic.phase_status === "design_locked" ? "Design locked" : "Gherkin locked"}
                      </span>
                    </div>
                  </>
                ) : (
                  "Select an epic with Phase 1 locked Gherkin stories."
                )}
              </div>
            </div>

            {generateBundle.isPending ? (
              <div className={cn(
                "space-y-1 rounded-md border p-4 text-sm",
                dark ? "border-violet-500/20 bg-violet-950/20 text-violet-300" : "border-violet-300 bg-violet-50 text-violet-700",
              )}>
                <div className="flex items-center gap-2">
                  <div className="size-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  <span className="font-medium">AI Working…</span>
                </div>
                <div className={dark ? "text-violet-400/70" : "text-violet-600/70"}>Loading memory bank and tech stack…</div>
                <div className={dark ? "text-violet-400/70" : "text-violet-600/70"}>Calling AI to generate design bundle. This can take several minutes…</div>
              </div>
            ) : null}
            {generateBundle.isError ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Generation failed: {String(generateBundle.error)}
              </div>
            ) : null}

            {designBundle ? (
              <div className="space-y-4">
                <div className={cn("flex rounded-md p-1", dark ? "bg-neutral-800" : "bg-slate-200")}>
                  <button
                    className={cn(
                      "h-10 flex-1 rounded text-sm transition-colors",
                      bundleTab === "ux"
                        ? "bg-violet-600 text-white"
                        : dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-800",
                    )}
                    onClick={() => setBundleTab("ux")}
                  >
                    <Compass className="mr-2 inline size-4" />
                    UX Design
                  </button>
                  <button
                    className={cn(
                      "h-10 flex-1 rounded text-sm transition-colors",
                      bundleTab === "architecture"
                        ? "bg-violet-600 text-white"
                        : dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-800",
                    )}
                    onClick={() => setBundleTab("architecture")}
                  >
                    <Code2 className="mr-2 inline size-4" />
                    System Architecture
                  </button>
                </div>

                {bundleTab === "ux" ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className={cn("min-h-96 overflow-auto rounded-md border", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-slate-900")}>
                      <div className={cn("border-b px-3 py-1.5 text-xs font-semibold", panelHeaderClass)}>Wireframes</div>
                      <MermaidBlock content={designBundle.wireframes} className="p-4 text-xs leading-5 text-neutral-200" />
                    </div>
                    <div className={cn("min-h-96 overflow-auto rounded-md border", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-slate-900")}>
                      <div className={cn("border-b px-3 py-1.5 text-xs font-semibold", panelHeaderClass)}>User Flow</div>
                      <MermaidBlock content={designBundle.user_flow} className="p-4 text-xs leading-5 text-violet-100" />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className={cn("min-h-96 overflow-auto rounded-md border", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-slate-900")}>
                      <div className={cn("border-b px-3 py-1.5 text-xs font-semibold", panelHeaderClass)}>Component Tree</div>
                      <div className="p-2">
                        <ComponentTreeView content={designBundle.component_tree} dark={dark} />
                      </div>
                    </div>
                    <div className={cn("min-h-96 overflow-auto rounded-md border", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-slate-900")}>
                      <div className={cn("border-b px-3 py-1.5 text-xs font-semibold", panelHeaderClass)}>Tech Spec (OpenAPI)</div>
                      <pre className="overflow-auto p-4 text-xs leading-5 text-neutral-200">{designBundle.tech_spec}</pre>
                    </div>
                  </div>
                )}

                <div className={cn("flex flex-wrap items-center gap-4 rounded-md border p-4", cardClass)}>
                  <label className={cn("inline-flex items-center gap-2 text-sm", labelClass)}>
                    <input type="checkbox" checked={designLeadApproved} onChange={(event) => setDesignLeadApproved(event.target.checked)} />
                    Design Lead Approval (UX & Flows)
                  </label>
                  <label className={cn("inline-flex items-center gap-2 text-sm", labelClass)}>
                    <input type="checkbox" checked={techLeadApproved} onChange={(event) => setTechLeadApproved(event.target.checked)} />
                    Tech Lead Approval (Specs & Architecture)
                  </label>
                  <Button
                    className="ml-auto"
                    disabled={!canSave || busy}
                    onClick={() =>
                      selectedEpic &&
                      lockDesign.mutate(
                        {
                          epic_id: selectedEpic.epic_id,
                          epic_title: selectedEpic.epic_title,
                          story_ids: designBundle.story_ids,
                          wireframes: designBundle.wireframes,
                          user_flow: designBundle.user_flow,
                          component_tree: designBundle.component_tree,
                          tech_spec: designBundle.tech_spec,
                        },
                        {
                          onSuccess: (data) => toast.success(`Design locked for ${data.story_ids.length} story/stories`),
                        },
                      )
                    }
                  >
                    <CheckCircle2 className="size-4" />
                    Save & Lock Design
                  </Button>
                </div>
                {lockDesign.data ? (
                  <Callout>
                    Design locked for {lockDesign.data.story_ids.length} story/stories.
                    {lockDesign.data.taiga_failures?.length ? ` ${lockDesign.data.taiga_failures.length} Taiga transition(s) failed.` : ""}
                  </Callout>
                ) : null}
                {lockDesign.isError ? (
                  <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    Save failed: {String(lockDesign.error)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
