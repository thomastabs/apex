"use client";

import { useState } from "react";
import { Figma, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFigmaContext } from "@/lib/stores/session-store";
import { useGenerateStoriesFromFigma } from "@/lib/hooks/use-phase1";
import {
  figmaGetFile,
  deriveFramesAndFlows,
  figmaThumbnails,
  type FigmaFrame,
  type FigmaFlowEdge,
} from "@/lib/api/figma";

type Props = {
  dark: boolean;
  onGenerated: (draft: string, count: number) => void;
};

/** Phase-1 "From Figma" panel: pick designed frames → generate a story draft. */
export function FigmaStoryPanel({ dark, onGenerated }: Props) {
  const figma = useFigmaContext();
  const [frames, setFrames] = useState<FigmaFrame[]>([]);
  const [flows, setFlows] = useState<FigmaFlowEdge[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const generate = useGenerateStoriesFromFigma();

  const cardClass = cn(
    "rounded-lg border p-4 space-y-3",
    dark ? "border-neutral-700 bg-neutral-900/40" : "border-slate-200 bg-slate-50",
  );

  if (!figma) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Figma className="size-4" /> From Figma
        </div>
        <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
          Connect a Figma file in the sidebar to generate user stories directly from your designed screens.
        </p>
      </div>
    );
  }

  async function loadScreens() {
    if (!figma) return;
    setLoading(true);
    try {
      const file = await figmaGetFile(figma.token, figma.fileKey, 2);
      const derived = deriveFramesAndFlows(file);
      setFrames(derived.frames);
      setFlows(derived.flows);
      setSelected(new Set(derived.frames.map((f) => f.node_id)));
      setLoadedOnce(true);
      if (!derived.frames.length) {
        toast.info("No top-level frames found in this Figma file.");
      } else {
        figmaThumbnails(figma.token, figma.fileKey, derived.frames.map((f) => f.node_id))
          .then(setThumbs)
          .catch(() => {/* thumbnails are best-effort */});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load Figma screens.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleGenerate() {
    const chosen = frames.filter((f) => selected.has(f.node_id));
    if (!chosen.length) {
      toast.error("Select at least one screen.");
      return;
    }
    const names = new Set(chosen.map((f) => f.name));
    const scopedFlows = flows.filter((e) => names.has(e.from_name) && names.has(e.to_name));
    generate.mutate(
      {
        frames: chosen.map((f) => ({ name: f.name, description: "" })),
        flows: scopedFlows,
      },
      {
        onSuccess: (data) => {
          onGenerated(data.nl_draft, data.story_count);
          toast.success(`Generated ${data.story_count} stories from ${chosen.length} screen${chosen.length === 1 ? "" : "s"}`);
        },
      },
    );
  }

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Figma className="size-4" /> From Figma
        </div>
        <button
          className={cn("inline-flex items-center gap-1.5 text-xs transition-colors",
            dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-500")}
          onClick={loadScreens}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {loadedOnce ? "Reload screens" : "Load screens"}
        </button>
      </div>

      <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
        Pick the screens to turn into user stories. Navigation flows between them become scenarios.
      </p>

      {loading ? (
        <div className={cn("flex items-center gap-2 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
          <Loader2 className="size-3.5 animate-spin" /> Loading screens from Figma…
        </div>
      ) : frames.length ? (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className={dark ? "text-neutral-500" : "text-slate-500"}>
              {selected.size}/{frames.length} selected
            </span>
            <div className="flex gap-3">
              <button className="hover:underline" onClick={() => setSelected(new Set(frames.map((f) => f.node_id)))}>Select all</button>
              <button className="hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {frames.map((f) => {
              const isSel = selected.has(f.node_id);
              return (
                <button
                  key={f.node_id}
                  onClick={() => toggle(f.node_id)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded border text-left transition-colors",
                    isSel
                      ? "border-violet-500 ring-1 ring-violet-500"
                      : dark ? "border-neutral-700 hover:border-neutral-600" : "border-slate-300 hover:border-slate-400",
                  )}
                >
                  <div className={cn("aspect-video w-full overflow-hidden", dark ? "bg-neutral-950" : "bg-white")}>
                    {thumbs[f.node_id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[f.node_id]} alt={f.name} className="size-full object-contain" />
                    ) : (
                      <div className={cn("flex size-full items-center justify-center", dark ? "text-neutral-700" : "text-slate-300")}>
                        <Figma className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-1.5 px-2 py-1.5 text-xs",
                    isSel ? (dark ? "bg-violet-950/40 text-violet-200" : "bg-violet-50 text-violet-800") : (dark ? "text-neutral-300" : "text-slate-700"))}>
                    <span className={cn("size-3 shrink-0 rounded-sm border", isSel ? "border-violet-500 bg-violet-500" : dark ? "border-neutral-600" : "border-slate-400")} />
                    <span className="truncate">{f.name}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={generate.isPending || !selected.size}
          >
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Figma className="size-4" />}
            {generate.isPending ? "Generating…" : `Generate stories from ${selected.size} screen${selected.size === 1 ? "" : "s"}`}
          </button>
        </>
      ) : loadedOnce ? (
        <p className={cn("text-xs", dark ? "text-neutral-600" : "text-slate-400")}>No frames found in this file.</p>
      ) : null}
    </div>
  );
}
