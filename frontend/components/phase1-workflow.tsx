"use client";

import { useMemo, useState } from "react";
import { Download, FilePlus2, Sparkles } from "lucide-react";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import {
  useCompileGherkin,
  useGenerateNlStories,
  usePhase1Epics,
  usePushPhase1Stories,
  useSuggestPhase1Epics,
} from "@/lib/hooks/use-phase1";
import type { CompiledStory, EpicSuggestion } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Mode = "create" | "load" | "suggest";

export function Phase1Workflow() {
  const [mode, setMode] = useState<Mode>("create");
  const [epicTitle, setEpicTitle] = useState("");
  const [epicDescription, setEpicDescription] = useState("");
  const [epicId, setEpicId] = useState<number | null>(null);
  const [hint, setHint] = useState("");
  const [nlDraft, setNlDraft] = useState("");
  const [compiledStories, setCompiledStories] = useState<CompiledStory[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  const epics = usePhase1Epics();
  const suggestEpics = useSuggestPhase1Epics();
  const generate = useGenerateNlStories();
  const compile = useCompileGherkin();
  const push = usePushPhase1Stories();

  const suggestions = suggestEpics.data?.epics ?? [];
  const activeEpic = useMemo(
    () => epics.data?.find((epic) => epic.id === epicId),
    [epics.data, epicId],
  );
  const canGenerate = mode === "load" ? Boolean(activeEpic) : Boolean(epicTitle.trim());
  const busy = generate.isPending || compile.isPending || push.isPending || suggestEpics.isPending;

  function useSuggestion(suggestion: EpicSuggestion, index: number) {
    setSelectedSuggestion(index);
    setEpicTitle(suggestion.title);
    setEpicDescription(suggestion.description);
    setEpicId(null);
  }

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <h1 className="text-4xl font-bold text-white">Phase 1 · Requirements</h1>
        <p className="mt-2 text-neutral-500">
          Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria
        </p>
      </div>

      <div className="mb-6 rounded-md border border-neutral-800 bg-[#1f1f21] px-4 py-3 text-sm text-neutral-500">
        › ⓘ View Process Diagram (How this works)
      </div>

      <div className="space-y-8 border-t border-neutral-700 pt-6">
        <section className="space-y-4">
          <SectionHeading>Step 1 · Define Your Epic</SectionHeading>
          <div className="grid grid-cols-3 rounded-md bg-neutral-800 p-1">
            {[
              { value: "create", Icon: FilePlus2, label: "Create New" },
              { value: "load", Icon: Download, label: "Load from Taiga" },
              { value: "suggest", Icon: Sparkles, label: "AI Suggests" },
            ].map(({ value, Icon, label }) => (
              <button
                key={String(value)}
                onClick={() => setMode(value as Mode)}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded text-sm text-neutral-400",
                  mode === value && "bg-violet-600 font-semibold text-white",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          {mode === "create" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_340px] gap-4">
                <label className="text-sm font-medium text-neutral-200">
                  Epic Title <span className="block text-xs text-red-400">Required</span>
                  <Input value={epicTitle} onChange={(event) => setEpicTitle(event.target.value)} placeholder="e.g. User Authentication" />
                </label>
                <label className="text-sm font-medium text-neutral-200">
                  Taiga Epic ID <span className="block text-xs text-neutral-500">Optional — leave blank to create new</span>
                  <Input value={epicId ?? ""} onChange={(event) => setEpicId(event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 42" />
                </label>
              </div>
              <label className="block text-sm font-medium text-neutral-200">
                Description
                <Textarea rows={5} value={epicDescription} onChange={(event) => setEpicDescription(event.target.value)} placeholder="Describe the epic in detail — context helps the AI generate better stories..." />
              </label>
            </div>
          ) : null}

          {mode === "load" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-neutral-500">
                <span>{epics.data?.length ?? 0} epic(s) in this project</span>
                <button className="text-violet-300" onClick={() => epics.refetch()}>↻ Refresh</button>
              </div>
              {epics.data?.map((epic) => (
                <div key={epic.id} className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded border border-violet-700 px-2 py-1 text-xs text-violet-200">#{epic.ref}</span>
                    <h3 className="font-semibold text-white">{epic.subject}</h3>
                  </div>
                  <p className="mb-4 text-sm leading-6 text-neutral-400">{epic.description || "No description."}</p>
                  <Button
                    onClick={() => {
                      setEpicId(epic.id);
                      setEpicTitle(epic.subject);
                      setEpicDescription(epic.description);
                    }}
                    variant="secondary"
                  >
                    ✓ Use Epic
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {mode === "suggest" ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-neutral-200">
                AI Guidance <span className="text-neutral-500">Optional — focus or constrain the epic suggestions.</span>
                <Input value={hint} onChange={(event) => setHint(event.target.value)} placeholder="e.g. focus on mobile-first flows, B2B enterprise context..." />
              </label>
              <Button className="w-full" onClick={() => suggestEpics.mutate(hint)} disabled={suggestEpics.isPending}>
                <Sparkles className="size-4" />
                AI Suggests
              </Button>
              {suggestions.length ? (
                <div className="space-y-3">
                  <div className="text-sm text-neutral-500">{suggestions.length} suggestions</div>
                  {suggestions.map((suggestion, index) => (
                    <div key={suggestion.title} className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4">
                      <button className="mb-3 flex w-full items-center gap-2 text-left font-semibold text-white" onClick={() => setSelectedSuggestion(selectedSuggestion === index ? null : index)}>
                        › <Sparkles className="size-4 text-violet-400" /> {suggestion.title}
                      </button>
                      {selectedSuggestion === index ? (
                        <div className="space-y-3">
                          <Textarea rows={3} value={suggestion.description} readOnly />
                          <Button variant="secondary" onClick={() => useSuggestion(suggestion, index)}>
                            Use Suggestion
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-4 border-t border-neutral-700 pt-6">
          <SectionHeading>Step 2 · Generate User Stories</SectionHeading>
          {!canGenerate ? <Callout>Fill in your Epic above, then click Generate to create Natural Language user stories.</Callout> : null}
          <label className="block text-sm font-medium text-neutral-200">
            AI Guidance <span className="text-neutral-500">Optional</span>
            <Input value={hint} onChange={(event) => setHint(event.target.value)} placeholder="e.g. focus on error handling and edge cases" />
          </label>
          <Button
            className="w-full"
            disabled={!canGenerate || busy}
            onClick={() =>
              generate.mutate(
                { epic_subject: epicTitle, epic_description: epicDescription, hint },
                { onSuccess: (data) => setNlDraft(data.nl_draft) },
              )
            }
          >
            <Sparkles className="size-4" />
            Generate Stories
          </Button>
        </section>

        {nlDraft ? (
          <section className="space-y-4 border-t border-neutral-700 pt-6">
            <SectionHeading>Step 3 · Review Natural Language Draft</SectionHeading>
            <Textarea rows={14} value={nlDraft} onChange={(event) => setNlDraft(event.target.value)} />
            <Button
              disabled={busy}
              onClick={() =>
                compile.mutate(nlDraft, {
                  onSuccess: (data) => setCompiledStories(data.stories),
                })
              }
            >
              Compile to Gherkin
            </Button>
          </section>
        ) : null}

        {compiledStories.length ? (
          <section className="space-y-4 border-t border-neutral-700 pt-6">
            <SectionHeading>Step 4 · Review Gherkin & Push to Taiga</SectionHeading>
            {compiledStories.map((story, index) => (
              <div key={`${story.title}-${index}`} className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4">
                <Input
                  className="mb-3 font-semibold"
                  value={story.title}
                  onChange={(event) =>
                    setCompiledStories((stories) =>
                      stories.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                    )
                  }
                />
                <Textarea
                  rows={10}
                  value={story.gherkin}
                  onChange={(event) =>
                    setCompiledStories((stories) =>
                      stories.map((item, i) => (i === index ? { ...item, gherkin: event.target.value } : item)),
                    )
                  }
                />
              </div>
            ))}
            <Button
              disabled={busy}
              onClick={() =>
                push.mutate({
                  epic_subject: epicTitle,
                  epic_description: epicDescription,
                  epic_id: epicId,
                  stories: compiledStories,
                })
              }
            >
              Push Stories to Taiga
            </Button>
            {push.data ? <Callout>{push.data.count} stories pushed and locked in the functional spec.</Callout> : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
