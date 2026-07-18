"use client";

import { useState } from "react";
import { Figma, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFigmaContext } from "@/lib/stores/session-store";
import { useGenerateStoriesFromFigma } from "@/lib/hooks/use-phase1";
import {
  figmaGetFile,
  figmaGetProjectFiles,
  parseFigmaProjectUrl,
  deriveFramesAndFlows,
  figmaThumbnails,
  type FigmaFlowEdge,
} from "@/lib/api/figma";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";

type Props = {
  dark: boolean;
  onGenerated: (draft: string, count: number) => void;
};

// A frame as shown in the panel. In project mode `fileKey`/`rawNodeId` are set and
// `node_id` is file-namespaced (`<fileKey>:<raw>`) so selection ids stay unique
// across files; single-file mode leaves them undefined (legacy behaviour).
type PanelFrame = { node_id: string; name: string; page: string; fileKey?: string; rawNodeId?: string };

/** Phase-1 "From Figma" panel: pick designed frames → generate a story draft. */
export function FigmaStoryPanel({ dark, onGenerated }: Props) {
  const figma = useFigmaContext();
  const [frames, setFrames] = useState<PanelFrame[]>([]);
  const [flows, setFlows] = useState<FigmaFlowEdge[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [projectUrl, setProjectUrl] = useState("");
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

  // Project import: load every file in a Figma project, frames grouped/namespaced by
  // file → generate ONE combined draft from the union of selected frames.
  async function loadProject() {
    if (!figma) return;
    const project = parseFigmaProjectUrl(projectUrl);
    if (!project) {
      toast.error("Enter a valid Figma project URL.");
      return;
    }
    setLoading(true);
    setThumbs({});
    try {
      const files = await figmaGetProjectFiles(figma.token, project.projectId);
      const allFrames: PanelFrame[] = [];
      const allFlows: FigmaFlowEdge[] = [];
      for (const file of files) {
        const doc = await figmaGetFile(figma.token, file.key, 2);
        const { frames: ff, flows: fl } = deriveFramesAndFlows(doc);
        for (const f of ff) {
          allFrames.push({ node_id: `${file.key}:${f.node_id}`, name: f.name, page: file.name, fileKey: file.key, rawNodeId: f.node_id });
        }
        allFlows.push(...fl);
      }
      setFrames(allFrames);
      setFlows(allFlows);
      setSelected(new Set(allFrames.map((f) => f.node_id)));
      setLoadedOnce(true);
      if (!allFrames.length) toast.info("No frames found in this project's files.");
    } catch {
      toast.error("Could not load the project. Re-generate your Figma token with the projects:read scope.");
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
    // Distinct source files among the selection. A single source (legacy single-file,
    // or a one-file selection in project mode) sends one file_key so the backend renders
    // its raw node ids. A multi-file union sends file-namespaced ids (`<fileKey>:<raw>`)
    // and NO file_key — the backend groups by file and renders each against its own file.
    const sourceKeys = new Set(chosen.map((f) => f.fileKey).filter(Boolean) as string[]);
    const singleSource = sourceKeys.size <= 1;
    const fileKey = singleSource ? ([...sourceKeys][0] ?? figma?.fileKey) : undefined;
    generate.mutate(
      {
        frames: chosen.map((f) => ({
          name: f.name,
          description: "",
          // single source → raw node id so the backend can render it; multi → namespaced
          node_id: singleSource ? (f.rawNodeId ?? f.node_id) : f.node_id,
        })),
        flows: scopedFlows,
        // U1: the token always goes (it enables PNG rendering for image grounding).
        // file_key is sent only for a single source; for a multi-file union it's omitted
        // so the backend takes the namespaced multi-file render path.
        file_key: singleSource ? fileKey : undefined,
        figmaToken: figma?.token,
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
        {" "}📷 The first 12 selected frames are rendered and sent to the AI as images, so stories are grounded in the actual design (vision models only).
      </p>

      {/* Project import: load frames across all files in a project (one combined draft). */}
      <div className="flex items-center gap-2">
        <input
          value={projectUrl}
          onChange={(e) => setProjectUrl(e.target.value)}
          placeholder="…or paste a Figma project URL to span its files"
          className={cn("h-8 flex-1 rounded border px-2 text-xs outline-none focus:border-violet-500",
            dark ? "border-neutral-700 bg-neutral-950 text-neutral-200" : "border-slate-300 bg-white text-slate-700")}
        />
        <button
          className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-xs transition-colors disabled:opacity-50",
            dark ? "border-neutral-700 text-neutral-300 hover:border-violet-500/50" : "border-slate-300 text-slate-600 hover:border-violet-300")}
          onClick={loadProject}
          disabled={loading || !projectUrl.trim()}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} /> Load project
        </button>
      </div>

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
          <AiGroundingNote files={AI_GROUNDING.phase1FigmaStories} dark={dark} />
        </>
      ) : loadedOnce ? (
        <p className={cn("text-xs", dark ? "text-neutral-600" : "text-slate-400")}>No frames found in this file.</p>
      ) : null}
    </div>
  );
}
