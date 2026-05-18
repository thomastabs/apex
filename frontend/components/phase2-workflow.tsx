"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Code2, Compass, Info, RefreshCw, RotateCcw, Save, Sparkles, Unlock } from "lucide-react";
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
import { MermaidBlock } from "@/components/mermaid-block";
import { cn } from "@/lib/utils";

type BundleTab = "ux" | "architecture";

const TREE_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#fb923c"];

function ComponentTreeView({ content }: { content: string }) {
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
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#e5e5e5" }}>{stripped}</span>
      </div>,
    );
  }
  if (!rows.length) return null;
  return (
    <div style={{ padding: "10px 6px", background: "#111", borderRadius: 6, overflowY: "auto" }}>
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
  const busy = proposeStack.isPending || lockStack.isPending || generateBundle.isPending || lockDesign.isPending || refreshIndex.isPending;
  const canSave = Boolean(selectedEpic && designBundle && designLeadApproved && techLeadApproved);

  function clearDesign() {
    setDesignBundle(null);
    setDesignLeadApproved(false);
    setTechLeadApproved(false);
  }

  function reopenGate0() {
    setStackReopened(true);
    setTechStackDraft(techStack.data?.tech_stack ?? "");
  }

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <h1 className="text-4xl font-bold text-white">Phase 2 · Design</h1>
        <p className="mt-2 text-neutral-500">
          Design Lead + Tech Lead gate: visual prototype and OpenAPI spec per epic.
        </p>
      </div>

      <div className="mb-6 rounded-md border border-neutral-800">
        <button
          className="flex w-full items-center gap-2 px-4 py-3 text-sm text-neutral-400 hover:text-neutral-300"
          onClick={() => setDiagramOpen(!diagramOpen)}
        >
          <ChevronRight className={cn("size-4 transition-transform", diagramOpen && "rotate-90")} />
          <Info className="size-4" />
          <span>View Process Diagram (How this works)</span>
        </button>
        {diagramOpen ? (
          <div className="border-t border-neutral-800 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/design.svg" alt="Phase 2 design process diagram" className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      <div className="space-y-8 border-t border-neutral-700 pt-6">
        <section className="space-y-4">
          <SectionHeading>Stage A · Tech Stack Definition</SectionHeading>
          {stackDefined ? (
            <div className="flex items-start justify-between gap-4">
              <Callout>Tech Stack is locked for this project. You can review it below before designing epics.</Callout>
              <button
                className="flex shrink-0 items-center gap-1 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
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
          <label className="block text-sm font-medium text-neutral-200">
            Tech Lead Guidance <span className="text-neutral-500">Optional</span>
            <Input value={stackHint} onChange={(event) => setStackHint(event.target.value)} placeholder="e.g. prefer Python backend, PostgreSQL, simple deployment" />
          </label>
          {!stackDefined ? (
            <Button
              disabled={busy}
              onClick={() =>
                proposeStack.mutate(
                  { hint: stackHint },
                  {
                    onSuccess: (data) => {
                      setAlternatives(data.alternatives);
                      setSelectedAlternativeIndex(-1);
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
                    "rounded-md border bg-[#1f1f21] p-4 text-left",
                    selectedAlternativeIndex === index ? "border-violet-500" : "border-neutral-800",
                  )}
                >
                  <div className="mb-2 font-semibold text-white">Option {index + 1}: {alt.name}</div>
                  <p className="mb-3 text-sm leading-6 text-neutral-400">{alt.description}</p>
                  <pre className="whitespace-pre-wrap text-xs text-neutral-500">{alt.trade_offs}</pre>
                </button>
              ))}
            </div>
          ) : null}

          <label className="block text-sm font-medium text-neutral-200">
            Locked Tech Stack Draft
            <Textarea rows={8} value={techStackDraft} onChange={(event) => setTechStackDraft(event.target.value)} />
          </label>
          <Button
            disabled={busy || !techStackDraft.trim()}
            onClick={() => {
              lockStack.mutate(
                { tech_stack: techStackDraft },
                { onSuccess: () => setStackReopened(false) },
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
          <section className="space-y-5 border-t border-neutral-700 pt-6">
            <SectionHeading>Stage B · Epic Design Bundle</SectionHeading>
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-neutral-200">
                  Eligible Epic
                  <select
                    className="mt-1 h-10 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-sm text-white"
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
                          onSuccess: (bundle) => setDesignBundle(bundle),
                        },
                      )
                    }
                  >
                    <Sparkles className="size-4" />
                    Generate
                  </Button>
                  <button
                    className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                    disabled={busy}
                    title="Refresh story index from Taiga"
                    onClick={() =>
                      refreshIndex.mutate(undefined, {
                        onSuccess: () => eligibleEpics.refetch(),
                      })
                    }
                  >
                    <RefreshCw className="size-3" />
                    Refresh
                  </button>
                  {designBundle ? (
                    <button
                      className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800"
                      title="Clear current design"
                      onClick={clearDesign}
                    >
                      <RotateCcw className="size-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4 text-sm text-neutral-400">
                {selectedEpic ? (
                  <>
                    <div className="font-semibold text-white">{selectedEpic.epic_title}</div>
                    <div>{selectedEpic.story_count} locked story/stories available for design.</div>
                    <div className="mt-1 text-xs">
                      Status:{" "}
                      <span className={selectedEpic.phase_status === "design_locked" ? "text-emerald-400" : "text-violet-300"}>
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
              <div className="space-y-1 rounded-md border border-neutral-800 bg-[#1f1f21] p-4 text-sm text-neutral-400">
                <div>Loading memory bank and tech stack…</div>
                <div>Calling AI to generate design bundle. This can take several minutes…</div>
              </div>
            ) : null}
            {generateBundle.isError ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Generation failed: {String(generateBundle.error)}
              </div>
            ) : null}

            {designBundle ? (
              <div className="space-y-4">
                <div className="flex rounded-md bg-neutral-800 p-1">
                  <button
                    className={cn("h-10 flex-1 rounded text-sm", bundleTab === "ux" ? "bg-violet-600 text-white" : "text-neutral-400")}
                    onClick={() => setBundleTab("ux")}
                  >
                    <Compass className="mr-2 inline size-4" />
                    UX Design
                  </button>
                  <button
                    className={cn("h-10 flex-1 rounded text-sm", bundleTab === "architecture" ? "bg-violet-600 text-white" : "text-neutral-400")}
                    onClick={() => setBundleTab("architecture")}
                  >
                    <Code2 className="mr-2 inline size-4" />
                    System Architecture
                  </button>
                </div>

                {bundleTab === "ux" ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950">
                      <div className="border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400">Wireframes</div>
                      <MermaidBlock content={designBundle.wireframes} className="p-4 text-xs leading-5 text-neutral-200" />
                    </div>
                    <div className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950">
                      <div className="border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400">User Flow</div>
                      <MermaidBlock content={designBundle.user_flow} className="p-4 text-xs leading-5 text-violet-100" />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950">
                      <div className="border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400">Component Tree</div>
                      <div className="p-2">
                        <ComponentTreeView content={designBundle.component_tree} />
                      </div>
                    </div>
                    <div className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950">
                      <div className="border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400">Tech Spec (OpenAPI)</div>
                      <pre className="overflow-auto p-4 text-xs leading-5 text-neutral-200">{designBundle.tech_spec}</pre>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 rounded-md border border-neutral-800 bg-[#1f1f21] p-4">
                  <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input type="checkbox" checked={designLeadApproved} onChange={(event) => setDesignLeadApproved(event.target.checked)} />
                    Design Lead Approval (UX & Flows)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input type="checkbox" checked={techLeadApproved} onChange={(event) => setTechLeadApproved(event.target.checked)} />
                    Tech Lead Approval (Specs & Architecture)
                  </label>
                  <Button
                    className="ml-auto"
                    disabled={!canSave || busy}
                    onClick={() =>
                      selectedEpic &&
                      lockDesign.mutate({
                        epic_id: selectedEpic.epic_id,
                        epic_title: selectedEpic.epic_title,
                        story_ids: designBundle.story_ids,
                        wireframes: designBundle.wireframes,
                        user_flow: designBundle.user_flow,
                        component_tree: designBundle.component_tree,
                        tech_spec: designBundle.tech_spec,
                      })
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
