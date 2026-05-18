"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Code2, Compass, Save, Sparkles } from "lucide-react";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import {
  useEligiblePhase2Epics,
  useGenerateDesignBundle,
  useLockEpicDesign,
  useLockTechStack,
  useProposeTechStack,
  useTechStackStatus,
} from "@/lib/hooks/use-phase2";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { cn } from "@/lib/utils";

type BundleTab = "ux" | "architecture";

export function Phase2Workflow() {
  const [stackHint, setStackHint] = useState("");
  const [bundleTab, setBundleTab] = useState<BundleTab>("ux");
  const techStack = useTechStackStatus();
  const eligibleEpics = useEligiblePhase2Epics();
  const proposeStack = useProposeTechStack();
  const lockStack = useLockTechStack();
  const generateBundle = useGenerateDesignBundle();
  const lockDesign = useLockEpicDesign();

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

  const stackDefined = Boolean(techStack.data?.defined);
  const busy = proposeStack.isPending || lockStack.isPending || generateBundle.isPending || lockDesign.isPending;
  const canSave = Boolean(selectedEpic && designBundle && designLeadApproved && techLeadApproved);

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <h1 className="text-4xl font-bold text-white">Phase 2 · Design</h1>
        <p className="mt-2 text-neutral-500">
          Design Lead + Tech Lead gate: visual prototype and OpenAPI spec per epic.
        </p>
      </div>

      <div className="mb-6 rounded-md border border-neutral-800 bg-[#1f1f21] px-4 py-3 text-sm text-neutral-500">
        › ⓘ View Process Diagram (How this works)
      </div>

      <div className="space-y-8 border-t border-neutral-700 pt-6">
        <section className="space-y-4">
          <SectionHeading>Stage A · Tech Stack Definition</SectionHeading>
          {stackDefined ? (
            <Callout>Tech Stack is locked for this project. You can review it below before designing epics.</Callout>
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
            onClick={() => lockStack.mutate({ tech_stack: techStackDraft })}
          >
            <Save className="size-4" />
            Lock Tech Stack to Memory Bank
          </Button>
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
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  className="w-full"
                  disabled={busy || !selectedEpic}
                  onClick={() =>
                    selectedEpic &&
                    generateBundle.mutate(
                      { epic_id: selectedEpic.epic_id },
                      { onSuccess: (bundle) => setDesignBundle(bundle) },
                    )
                  }
                >
                  <Sparkles className="size-4" />
                  Generate Design Bundle
                </Button>
              </div>
              <div className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4 text-sm text-neutral-400">
                {selectedEpic ? (
                  <>
                    <div className="font-semibold text-white">{selectedEpic.epic_title}</div>
                    <div>{selectedEpic.story_count} locked story/stories available for design.</div>
                  </>
                ) : (
                  "Select an epic with Phase 1 locked Gherkin stories."
                )}
              </div>
            </div>

            {generateBundle.isPending ? (
              <div className="rounded-md border border-neutral-800 bg-[#1f1f21] p-6 text-neutral-400">
                Generating design bundle. This can take several minutes...
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
                    <pre className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-neutral-200">
                      {designBundle.wireframes}
                    </pre>
                    <pre className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-violet-100">
                      {designBundle.user_flow}
                    </pre>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <pre className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-neutral-200">
                      {designBundle.component_tree}
                    </pre>
                    <pre className="min-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-neutral-200">
                      {designBundle.tech_spec}
                    </pre>
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
                    {lockDesign.data.taiga_failures?.length ? ` ${lockDesign.data.taiga_failures.length} Taiga transition failed.` : ""}
                  </Callout>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
