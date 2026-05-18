"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FilePlus2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import {
  useCompileGherkin,
  useGenerateNlStories,
  usePhase1Epics,
  usePushPhase1Stories,
  useSuggestPhase1Epics,
} from "@/lib/hooks/use-phase1";
import { useApiContext } from "@/lib/stores/session-store";
import type { CompiledStory, EpicSuggestion } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Mode = "create" | "load" | "suggest";

const SIZES = ["S", "M", "L", "XL"] as const;

function draftKey(projectId: number | null) {
  return `apex-phase1-draft-${projectId ?? "none"}`;
}

function loadDraft(projectId: number | null): { nlDraft: string; compiledStories: CompiledStory[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as { nlDraft: string; compiledStories: CompiledStory[] }) : null;
  } catch {
    return null;
  }
}

function saveDraft(projectId: number | null, nlDraft: string, compiledStories: CompiledStory[]) {
  if (typeof window === "undefined") return;
  if (!nlDraft && !compiledStories.length) {
    localStorage.removeItem(draftKey(projectId));
  } else {
    localStorage.setItem(draftKey(projectId), JSON.stringify({ nlDraft, compiledStories }));
  }
}

export function Phase1Workflow() {
  const context = useApiContext();
  const [mode, setMode] = useState<Mode>("create");
  const [epicTitle, setEpicTitle] = useState("");
  const [epicDescription, setEpicDescription] = useState("");
  const [epicId, setEpicId] = useState<number | null>(null);
  const [hint, setHint] = useState("");
  const [nlDraft, setNlDraft] = useState("");
  const [compiledStories, setCompiledStories] = useState<CompiledStory[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [pushSuccess, setPushSuccess] = useState(false);
  const draftRestored = useRef(false);

  const epics = usePhase1Epics();
  const suggestEpics = useSuggestPhase1Epics();
  const generate = useGenerateNlStories();
  const compile = useCompileGherkin();
  const push = usePushPhase1Stories();

  // Restore draft on mount / project change
  useEffect(() => {
    if (draftRestored.current) return;
    const saved = loadDraft(context?.projectId ?? null);
    if (saved) {
      setNlDraft(saved.nlDraft);
      setCompiledStories(saved.compiledStories);
    }
    draftRestored.current = true;
  }, [context?.projectId]);

  // Persist draft whenever it changes
  useEffect(() => {
    saveDraft(context?.projectId ?? null, nlDraft, compiledStories);
  }, [context?.projectId, nlDraft, compiledStories]);

  const suggestions = suggestEpics.data?.epics ?? [];
  const activeEpic = useMemo(
    () => epics.data?.find((epic) => epic.id === epicId),
    [epics.data, epicId],
  );
  const canGenerate = mode === "load" ? Boolean(activeEpic) : Boolean(epicTitle.trim());
  const busy = generate.isPending || compile.isPending || push.isPending || suggestEpics.isPending;
  const hasUnsaved = Boolean(nlDraft || compiledStories.length);

  function requestModeSwitch(next: Mode) {
    if (hasUnsaved && mode !== next) {
      if (!window.confirm("Switch mode? Unsaved draft will be cleared.")) return;
      setNlDraft("");
      setCompiledStories([]);
    }
    setMode(next);
  }

  function useSuggestion(suggestion: EpicSuggestion, index: number) {
    setSelectedSuggestion(index);
    setEpicTitle(suggestion.title);
    setEpicDescription(suggestion.description);
    setEpicId(null);
  }

  function cycleSize(index: number) {
    setCompiledStories((stories) =>
      stories.map((s, i) => {
        if (i !== index) return s;
        const next = SIZES[(SIZES.indexOf(s.size as (typeof SIZES)[number]) + 1) % SIZES.length];
        return { ...s, size: next };
      }),
    );
  }

  function startNewEpic() {
    setEpicTitle("");
    setEpicDescription("");
    setEpicId(null);
    setHint("");
    setNlDraft("");
    setCompiledStories([]);
    setPushSuccess(false);
    setMode("create");
  }

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <h1 className="text-4xl font-bold text-white">Phase 1 · Requirements</h1>
        <p className="mt-2 text-neutral-500">
          Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria
        </p>
      </div>

      {hasUnsaved && (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Draft saved locally — work restored on refresh.
        </div>
      )}

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
                onClick={() => requestModeSwitch(value as Mode)}
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
            <div className="space-y-4">
              {compiledStories.map((story, index) => (
                <div key={`${story.title}-${index}`} className="rounded-md border border-neutral-800 bg-[#1f1f21] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Input
                      className="flex-1 font-semibold"
                      value={story.title}
                      onChange={(event) =>
                        setCompiledStories((stories) =>
                          stories.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                        )
                      }
                    />
                    <button
                      className="shrink-0 rounded border border-violet-700 bg-violet-950 px-3 py-1.5 text-xs font-bold text-violet-200 hover:bg-violet-900"
                      title="Click to cycle size: S → M → L → XL"
                      onClick={() => cycleSize(index)}
                    >
                      {story.size || "M"}
                    </button>
                    <button
                      className="grid shrink-0 size-8 place-items-center rounded text-red-400 hover:bg-red-950"
                      onClick={() => setCompiledStories((s) => s.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
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
            </div>
            <button
              className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              onClick={() => setCompiledStories((s) => [...s, { title: "New Story", size: "M", gherkin: "Feature: \n\nScenario: \n  Given \n  When \n  Then " }])}
            >
              <Plus className="size-4" /> Add Story
            </button>
            {pushSuccess ? (
              <div className="space-y-4">
                <Callout>{push.data?.count ?? 0} stories pushed and locked in the functional spec.</Callout>
                <Button variant="secondary" onClick={startNewEpic}>
                  <RefreshCw className="size-4" /> Start New Epic
                </Button>
              </div>
            ) : (
              <Button
                disabled={busy}
                onClick={() =>
                  push.mutate(
                    {
                      epic_subject: epicTitle,
                      epic_description: epicDescription,
                      epic_id: epicId,
                      stories: compiledStories,
                    },
                    { onSuccess: () => setPushSuccess(true) },
                  )
                }
              >
                Push Stories to Taiga
              </Button>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
