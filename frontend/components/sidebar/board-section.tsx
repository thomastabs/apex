"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Figma, Info, Layers3, Plus, RefreshCw, Trash2, TrendingDown, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useAcknowledgeBacktrace,
  useBoard,
  useCreateEpic,
  useCreateStory,
  useDeleteEpic,
  useDeleteStory,
  useRebuildStoryIndex,
  useSetStoryPhaseStatus,
  useAcknowledgeFigmaChange,
  useSetStoryFigmaLink,
  useStoryIndexStats,
  useStoryPhaseStatus,
  useStoryStatuses,
  useUpdateEpic,
  useUpdateStory,
} from "@/lib/hooks/use-workspace";
import { useAcknowledgeRegression } from "@/lib/hooks/use-phase6";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { toPmCtx, type ApexPhaseStatus } from "@/lib/api/workspace";
import { getAnalyticsSummary, type StoryRisk } from "@/lib/api/analytics";
import { figmaGetFile, deriveFramesAndFlows, figmaNodeUrl, figmaThumbnails, suggestFrameForStory } from "@/lib/api/figma";
import { useApiContext, useFigmaContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import type { Epic, Story } from "@/lib/api/types";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";

// ── dialogs ───────────────────────────────────────────────────────────────────

/** Board lists come from the PM tool's LIST endpoints, which omit
 *  descriptions (Taiga's light serializer). Edit dialogs must hydrate from
 *  the detail endpoint — otherwise the textarea starts empty and saving
 *  silently wipes the real description. */
function useDetailHydration<T extends { description?: string; version?: number | null }>(
  kind: "epic" | "story",
  id: number,
  fetchDetail: () => Promise<T>,
  setDescription: (d: string) => void,
) {
  const context = useApiContext();
  const hydratedRef = useRef(false);
  const detail = useQuery({
    queryKey: ["pm", `${kind}-detail`, context?.projectId, id],
    queryFn: fetchDetail,
    enabled: Boolean(context),
    staleTime: 0,
  });
  useEffect(() => {
    if (detail.data && !hydratedRef.current) {
      hydratedRef.current = true;
      setDescription(detail.data.description ?? "");
    }
  }, [detail.data, setDescription]);
  return detail;
}

function EpicDialog({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  const t = useT();
  const dark = useUiStore((state) => state.theme === "dark");
  const context = useApiContext();
  const [subject, setSubject] = useState(epic.subject);
  const [description, setDescription] = useState(epic.description ?? "");
  const [tagsInput, setTagsInput] = useState((epic.tags ?? []).join(", "));
  const update = useUpdateEpic();

  const detail = useDetailHydration(
    "epic", epic.id,
    () => getPmAdapter(context!.pmTool).getEpic(toPmCtx(context!), String(epic.id)),
    setDescription,
  );

  function save() {
    const version = detail.data?.version ?? epic.version;
    if (!version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { epicId: epic.id, version, fields: { subject, description, tags } },
      { onSuccess: onClose },
    );
  }

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>{t("common.epic")} <span className="font-mono">#{epic.ref}</span></h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("board.titleLabel")}</label>
            <input className={cn("h-9 border-violet-700", inputClass)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("board.epicTitlePlaceholder")} autoFocus />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("common.description")}</label>
            <textarea className={cn("h-52 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("board.describeEpicPlaceholder")} />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.tagsLabel")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("board.tagsHint")}</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("board.tagsEpicPlaceholder")} />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || detail.isLoading || !subject.trim()}
            onClick={save}
          >
            {update.isPending ? t("common.saving") : detail.isLoading ? t("common.loading") : t("common.save")}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

const APEX_STATUS_OPTION_KEYS: [ApexPhaseStatus, TranslationKey][] = [
  ["new", "board.apexStatus.new"],
  ["gherkin_locked", "board.apexStatus.gherkinLocked"],
  ["design_locked", "board.apexStatus.designLocked"],
  ["implementation", "board.apexStatus.implementation"],
  ["qa", "board.apexStatus.qa"],
  ["qa_passed", "board.apexStatus.qaPassed"],
  ["deployed", "board.apexStatus.deployed"],
];

type TracePrompt = { phase_label: string; route: string; reason: string };

function FigmaLinkField({ storyId, storySubject, figmaNodeId, figmaFileKey = "", dark, inputClass }: { storyId: number; storySubject: string; figmaNodeId: string; figmaFileKey?: string; dark: boolean; inputClass: string }) {
  const t = useT();
  const figma = useFigmaContext();
  const setLink = useSetStoryFigmaLink();
  const [frames, setFrames] = useState<{ node_id: string; name: string }[]>([]);
  const [fileModified, setFileModified] = useState("");
  const [loading, setLoading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState("");

  // The file this link points at: its own stored key, or the connected file (legacy).
  const linkFileKey = figmaFileKey || figma?.fileKey || "";

  // Render the linked frame's thumbnail (short-lived S3 URL — re-fetched per mount/link change).
  useEffect(() => {
    setThumbUrl("");
    if (!figma || !figmaNodeId || !linkFileKey) return;
    let alive = true;
    figmaThumbnails(figma.token, linkFileKey, [figmaNodeId])
      .then((map) => { if (alive) setThumbUrl(map[figmaNodeId] ?? ""); })
      .catch(() => {/* thumbnail is best-effort */});
    return () => { alive = false; };
  }, [figma, figmaNodeId, linkFileKey]);

  if (!figma) return null;

  const suggestion = !figmaNodeId && frames.length ? suggestFrameForStory(storySubject, frames) : null;

  function linkFrame(nodeId: string) {
    setLink.mutate(
      { storyId, figmaNodeId: nodeId, figmaModified: fileModified, figmaFileKey: figma!.fileKey },
      {
        onSuccess: () => toast.success(t("board.toast.linkedFigmaFrame")),
        onError: () => toast.error(t("board.toast.couldNotUpdateFigmaLink")),
      },
    );
  }

  async function loadFrames() {
    if (frames.length || loading || !figma) return;
    setLoading(true);
    try {
      // depth 2 = pages + top-level frames (enough to list/link). Per-frame drift
      // fingerprinting (which needed depth 3) was dropped to stay within Figma's budget.
      const file = await figmaGetFile(figma.token, figma.fileKey, 2);
      setFileModified(file.lastModified);
      setFrames(deriveFramesAndFlows(file).frames.map((f) => ({ node_id: f.node_id, name: f.name })));
    } catch {
      toast.error(t("board.toast.couldNotLoadFigmaFrames"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label className={cn("mb-1 flex items-center gap-1.5 text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
        <Figma className="size-3.5" /> {t("board.figmaFrameLabel")}
      </label>
      <div className="flex items-center gap-2">
        <select
          className={cn("h-9 flex-1 cursor-pointer", inputClass)}
          value={figmaNodeId}
          onFocus={loadFrames}
          disabled={setLink.isPending}
          onChange={(e) =>
            setLink.mutate(
              { storyId, figmaNodeId: e.target.value, figmaModified: fileModified, figmaFileKey: e.target.value ? figma.fileKey : "" },
              {
                onSuccess: () => toast.success(e.target.value ? t("board.toast.linkedFigmaFrame") : t("board.toast.unlinked")),
                onError: () => toast.error(t("board.toast.couldNotUpdateFigmaLink")),
              },
            )
          }
        >
          <option value="">{loading ? t("board.figmaLoadingFrames") : t("board.figmaNotLinked")}</option>
          {figmaNodeId && !frames.some((f) => f.node_id === figmaNodeId) && (
            <option value={figmaNodeId}>{t("board.figmaLinkedFrame", { id: figmaNodeId })}</option>
          )}
          {frames.map((f) => (
            <option key={f.node_id} value={f.node_id}>{f.name}</option>
          ))}
        </select>
        {figmaNodeId && (
          <a
            href={figmaNodeUrl(linkFileKey, figmaNodeId)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("inline-flex items-center gap-1 text-xs", dark ? "text-violet-300 hover:text-violet-200" : "text-violet-600 hover:text-violet-500")}
          >
            <ExternalLink className="size-3.5" /> {t("common.view")}
          </a>
        )}
      </div>
      {suggestion && (
        <button
          type="button"
          disabled={setLink.isPending}
          onClick={() => linkFrame(suggestion.frame.node_id)}
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-xs disabled:opacity-50",
            dark ? "text-violet-300 hover:text-violet-200" : "text-violet-600 hover:text-violet-500",
          )}
        >
          <Figma className="size-3.5" /> {t("board.figmaSuggested", { name: suggestion.frame.name })}
        </button>
      )}
      {figmaNodeId && thumbUrl && (
        <a
          href={figmaNodeUrl(figma.fileKey, figmaNodeId)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("mt-2 block overflow-hidden rounded-lg border", dark ? "border-neutral-700" : "border-slate-200")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived Figma S3 URL, not a static asset */}
          <img src={thumbUrl} alt={t("board.figmaThumbAlt")} className="max-h-44 w-full object-cover object-top" />
        </a>
      )}
    </div>
  );
}

function StoryDialog({ story, regressed = false, trace = null, figmaNodeId = "", figmaFileKey = "", figmaChanged = false, onClose }: { story: Story; regressed?: boolean; trace?: TracePrompt | null; figmaNodeId?: string; figmaFileKey?: string; figmaChanged?: boolean; onClose: () => void }) {
  const t = useT();
  const dark = useUiStore((state) => state.theme === "dark");
  const context = useApiContext();
  const figma = useFigmaContext();
  const router = useRouter();
  const ackRegression = useAcknowledgeRegression();
  const ackTrace = useAcknowledgeBacktrace();
  const ackFigmaChange = useAcknowledgeFigmaChange();

  async function acknowledgeFigmaChange() {
    let modified = "";
    if (figma) {
      const ackFileKey = figmaFileKey || figma.fileKey;
      try {
        // Re-baseline against the acknowledged design state: depth 1 is enough —
        // drift is file-level (lastModified).
        const file = await figmaGetFile(figma.token, ackFileKey, 1);
        modified = file.lastModified;
      } catch { /* re-baseline best-effort */ }
    }
    ackFigmaChange.mutate(
      { storyId: story.id, currentModified: modified },
      { onSuccess: () => toast.success(t("board.toast.designAcknowledged")), onError: () => toast.error(t("board.toast.couldNotAcknowledge")) },
    );
  }
  const [subject, setSubject] = useState(story.subject);
  const [description, setDescription] = useState(story.description ?? "");
  const [tagsInput, setTagsInput] = useState((story.tags ?? []).join(", "));
  const [statusId, setStatusId] = useState<string>(story.status != null ? String(story.status) : "");
  const update = useUpdateStory();
  const { data: statuses = [] } = useStoryStatuses();

  const phaseQuery = useStoryPhaseStatus(story.id);
  const setApexStatus = useSetStoryPhaseStatus();
  const [apexStatus, setApexStatus_] = useState<ApexPhaseStatus | "">("");
  const apexHydratedRef = useRef(false);
  useEffect(() => {
    if (phaseQuery.data && !apexHydratedRef.current) {
      apexHydratedRef.current = true;
      setApexStatus_(phaseQuery.data.phase_status ?? "");
    }
  }, [phaseQuery.data]);

  const detail = useDetailHydration(
    "story", story.id,
    () => getPmAdapter(context!.pmTool).getStory(toPmCtx(context!), String(story.id)),
    setDescription,
  );

  const statusHydratedRef = useRef(false);
  useEffect(() => {
    if (detail.data && !statusHydratedRef.current) {
      statusHydratedRef.current = true;
      const s = (detail.data as Story).status;
      if (s != null) setStatusId(String(s));
    }
  }, [detail.data]);

  async function save() {
    const version = detail.data?.version ?? story.version;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const apexChanged = apexStatus !== "" && apexStatus !== (phaseQuery.data?.phase_status ?? "");

    // Apex status lives entirely in the story index — independent of the PM
    // (Taiga/Jira) story fields below, which need a version for optimistic
    // concurrency. Firing it unconditionally means it's never silently
    // skipped by a missing version or a failed PM save. Awaited here (rather
    // than fire-and-forget .mutate() + immediate onClose()) because closing
    // the dialog unmounts it — TanStack Query drops per-call onSuccess/
    // onError callbacks once the component that called .mutate() is gone, so
    // the save was completing server-side with zero visible confirmation.
    if (apexChanged) {
      try {
        await setApexStatus.mutateAsync({ storyId: story.id, phaseStatus: apexStatus as ApexPhaseStatus });
        toast.success(t("board.toast.apexStatusUpdated"));
      } catch {
        toast.error(t("board.toast.failedApexStatusUpdate"));
      }
    }

    if (!version) {
      if (!apexChanged) toast.error(t("board.toast.storyNotLoadedYet"));
      onClose();
      return;
    }

    try {
      await update.mutateAsync({
        storyId: story.id,
        version,
        fields: { subject, description, tags, ...(statusId ? { status: statusId } : {}) },
      });
    } catch {
      toast.error(t("board.toast.failedSaveStory"));
    }
    onClose();
  }

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>{t("common.story")} <span className="font-mono">#{story.ref}</span></h3>
        {regressed ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <TrendingDown className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{t("board.conformanceRegressedTitle")}</p>
              <p className="mt-0.5">
                {t("board.conformanceRegressedDesc")}
              </p>
              <button
                className="mt-2 rounded bg-red-500/20 px-2 py-1 font-semibold transition-colors hover:bg-red-500/30 disabled:opacity-50"
                disabled={ackRegression.isPending}
                onClick={() =>
                  ackRegression.mutate(story.id, {
                    onSuccess: () => toast.success(t("board.toast.regressionAcknowledged")),
                    onError: () => toast.error(t("board.toast.couldNotAcknowledgeRegression")),
                  })
                }
              >
                {ackRegression.isPending ? t("board.acknowledging") : t("board.acknowledge")}
              </button>
            </div>
          </div>
        ) : null}
        {trace ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-600 dark:text-violet-400">
            <Undo2 className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{t("board.backwardTraceTitle", { phase: trace.phase_label })}</p>
              <p className="mt-0.5">{trace.reason}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-violet-500/20 px-2 py-1 font-semibold transition-colors hover:bg-violet-500/30"
                  onClick={() => { router.push(trace.route); onClose(); }}
                >
                  {t("board.reopenPhase", { phase: trace.phase_label })}
                </button>
                <button
                  className="rounded px-2 py-1 font-semibold transition-colors hover:bg-violet-500/20 disabled:opacity-50"
                  disabled={ackTrace.isPending}
                  onClick={() =>
                    ackTrace.mutate(story.id, {
                      onSuccess: () => toast.success(t("board.toast.backwardTraceAcknowledged")),
                      onError: () => toast.error(t("board.toast.couldNotAcknowledge")),
                    })
                  }
                >
                  {ackTrace.isPending ? t("board.acknowledging") : t("board.acknowledge")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {figmaChanged ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-600 dark:text-violet-400">
            <Figma className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{t("board.designChangedTitle")}</p>
              <p className="mt-0.5">{t("board.designChangedDesc")}</p>
              <button
                className="mt-2 rounded bg-violet-500/20 px-2 py-1 font-semibold transition-colors hover:bg-violet-500/30 disabled:opacity-50"
                disabled={ackFigmaChange.isPending}
                onClick={acknowledgeFigmaChange}
              >
                {ackFigmaChange.isPending ? t("board.acknowledging") : t("board.acknowledge")}
              </button>
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("board.titleLabel")}</label>
            <input className={cn("h-9 border-violet-700", inputClass)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("board.storyTitlePlaceholder")} autoFocus />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("common.description")}</label>
            <textarea
              className={cn("h-52 resize-none py-2", inputClass)}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={detail.isLoading ? t("board.loadingDescription") : t("board.describeStoryPlaceholder")}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("board.statusLabel")}</label>
            <select
              className={cn("h-9 cursor-pointer", inputClass)}
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              {statusId === "" && <option value="">{t("board.statusUnchanged")}</option>}
              {statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.apexStatusLabel")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("board.apexStatusHint")}</span>
            </label>
            {phaseQuery.isLoading ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{t("common.loading")}</p>
            ) : phaseQuery.data?.phase_status == null ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                {t("board.apexStatusNotIndexed")}
              </p>
            ) : (
              <select
                className={cn("h-9 cursor-pointer", inputClass)}
                value={apexStatus}
                onChange={(e) => setApexStatus_(e.target.value as ApexPhaseStatus)}
              >
                {APEX_STATUS_OPTION_KEYS.map(([v, labelKey]) => (
                  <option key={v} value={v}>{t(labelKey)}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.tagsLabel")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("board.tagsHint")}</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("board.tagsStoryEditPlaceholder")} />
          </div>
          <FigmaLinkField storyId={story.id} storySubject={story.subject} figmaNodeId={figmaNodeId} figmaFileKey={figmaFileKey} dark={dark} inputClass={inputClass} />
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || setApexStatus.isPending || detail.isLoading || !subject.trim()}
            onClick={save}
          >
            {update.isPending || setApexStatus.isPending ? t("common.saving") : detail.isLoading ? t("common.loading") : t("common.save")}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEpicDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dark = useUiStore((state) => state.theme === "dark");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const create = useCreateEpic();

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate({ subject: subject.trim(), description, tags }, { onSuccess: onClose });
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>{t("board.createEpicTitle")}</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.titleLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              className={cn("h-9 border-violet-700", inputClass)}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("board.epicTitlePlaceholder")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("common.description")}</label>
            <textarea className={cn("h-48 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("board.describeEpicPlaceholder")} />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.tagsLabel")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("board.tagsHint")}</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("board.tagsEpicPlaceholder")} />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={create.isPending || !subject.trim()}
            onClick={submit}
          >
            {create.isPending ? t("board.creating") : t("board.createEpicButton")}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateStoryDialog({ epicId, onClose }: { epicId: number; onClose: () => void }) {
  const t = useT();
  const dark = useUiStore((state) => state.theme === "dark");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [statusId, setStatusId] = useState<number | undefined>(undefined);
  const create = useCreateStory();
  const statuses = useStoryStatuses();

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate({ epicId, subject: subject.trim(), description, tags, statusId }, { onSuccess: onClose });
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>{t("board.createStoryTitle")}</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.titleLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              className={cn("h-9 border-violet-700", inputClass)}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("board.storyTitlePlaceholder")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("common.description")}</label>
            <textarea className={cn("h-40 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("board.describeStoryPlaceholder")} />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              {t("board.tagsLabel")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("board.tagsHint")}</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("board.tagsStoryCreatePlaceholder")} />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>{t("board.statusLabel")}</label>
            <select
              className={cn("h-8 w-full rounded border px-2 text-xs outline-none focus:border-violet-500", dark ? "border-neutral-700 bg-neutral-950 text-neutral-200" : "border-slate-300 bg-white text-slate-950")}
              value={statusId ?? ""}
              onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">{t("board.statusDefault")}</option>
              {statuses.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={create.isPending || !subject.trim()}
            onClick={submit}
          >
            {create.isPending ? t("board.creating") : t("board.createStoryButton")}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BoardSection ──────────────────────────────────────────────────────────────

type BoardSectionProps = DragSectionProps & {
  dark: boolean;
  projectId: number;
  confirm: (msg: string, cb: () => void) => void;
};

export function BoardSection({ dark, projectId, confirm, shellClass, dragHandlers, onDragStart }: BoardSectionProps) {
  const t = useT();
  const [boardOpen, setBoardOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedEpic, setExpandedEpic] = useState<number | null>(null);
  const [dialogEpic, setDialogEpic] = useState<Epic | null>(null);
  const [dialogStory, setDialogStory] = useState<Story | null>(null);
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [createStoryEpicId, setCreateStoryEpicId] = useState<number | null>(null);
  const [storyIndexSyncedAt, setStoryIndexSyncedAt] = useState<Date | null>(null);

  const board = useBoard();
  const deleteEpic = useDeleteEpic();
  const deleteStory = useDeleteStory();
  const rebuildIndex = useRebuildStoryIndex();
  const storyStats = useStoryIndexStats();

  useEffect(() => {
    if (boardOpen) {
      void board.refetch();
      void storyStats.refetch();
    }
  }, [boardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search-result jump target (set by the command palette) — see SearchFocus
  // in ui-store.ts. Consumed once: expand this section and open the matching
  // dialog, then clear so it doesn't re-fire on remount.
  const searchFocus = useUiStore((s) => s.searchFocus);
  const clearSearchFocus = useUiStore((s) => s.clearSearchFocus);
  useEffect(() => {
    if (!searchFocus || !board.data) return;
    if (searchFocus.kind === "epic") {
      const epic = board.data.find((e) => e.id === searchFocus.id);
      if (epic) { setBoardOpen(true); setDialogEpic(epic); clearSearchFocus(); }
    } else if (searchFocus.kind === "story") {
      const story = board.data.flatMap((e) => e.stories).find((s) => s.id === searchFocus.id);
      if (story) { setBoardOpen(true); setDialogStory(story); clearSearchFocus(); }
    }
  }, [searchFocus, board.data, clearSearchFocus]);
  const regressedIds = new Set(storyStats.data?.regressed_story_ids ?? []);
  const tracedIds = new Set(storyStats.data?.trace_story_ids ?? []);
  const TRACE_ROUTE: Record<string, string> = { gherkin_locked: "/phase1", design_locked: "/phase2" };
  const traceById = new Map(
    (storyStats.data?.trace_flags ?? []).map((t) => [
      t.story_id,
      { phase_label: t.phase_label, route: TRACE_ROUTE[t.phase] ?? "/phase1", reason: t.reason },
    ]),
  );
  const figmaById = new Map(
    (storyStats.data?.figma_links ?? []).map((f) => [f.story_id, { nodeId: f.figma_node_id, fileKey: f.figma_file_key ?? "" }]),
  );
  const figmaChangedIds = new Set(storyStats.data?.figma_changed_story_ids ?? []);

  // Predictive risk badge — reuse the analytics summary (single source of risk),
  // shared/cached with the Analytics page.
  const context = useApiContext();
  const riskQuery = useQuery({
    queryKey: ["analytics", "summary", context?.projectId],
    queryFn: () => getAnalyticsSummary(context!),
    enabled: Boolean(context),
    staleTime: 60_000,
  });
  const riskById = new Map<number, StoryRisk>(
    (riskQuery.data?.stories ?? []).map((s) => [s.story_id, s.risk]),
  );

  const epicCount = board.data?.length ?? 0;

  const q = filter.toLowerCase().trim();
  const filteredBoard = q
    ? (board.data ?? [])
        .map((epic) => {
          const epicMatch = epic.subject.toLowerCase().includes(q) || `#${epic.ref}`.includes(q);
          const filteredStories = epicMatch ? epic.stories : epic.stories.filter((s) => s.subject.toLowerCase().includes(q) || `#${s.ref}`.includes(q));
          return filteredStories.length > 0 ? { ...epic, stories: filteredStories } : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : (board.data ?? []);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const strongTextClass = dark ? "text-white" : "text-slate-950";
  const bodyTextClass = dark ? "text-neutral-300" : "text-slate-700";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      {typeof document !== "undefined" ? createPortal(
        <>
          {dialogEpic ? <EpicDialog epic={dialogEpic} onClose={() => setDialogEpic(null)} /> : null}
          {dialogStory ? <StoryDialog story={dialogStory} regressed={regressedIds.has(dialogStory.id)} trace={traceById.get(dialogStory.id) ?? null} figmaNodeId={figmaById.get(dialogStory.id)?.nodeId ?? ""} figmaFileKey={figmaById.get(dialogStory.id)?.fileKey ?? ""} figmaChanged={figmaChangedIds.has(dialogStory.id)} onClose={() => setDialogStory(null)} /> : null}
          {createEpicOpen ? <CreateEpicDialog onClose={() => setCreateEpicOpen(false)} /> : null}
          {createStoryEpicId !== null ? (
            <CreateStoryDialog epicId={createStoryEpicId} onClose={() => setCreateStoryEpicId(null)} />
          ) : null}
        </>,
        document.body,
      ) : null}
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Layers3 className="size-4" />}
          title={t("board.panelTitle")}
          badge={`${epicCount}`}
          open={boardOpen}
          onClick={() => setBoardOpen(!boardOpen)}
          onDragStart={onDragStart}
          actions={
            <button
              onClick={(e) => { e.stopPropagation(); setFilterOpen((v) => !v); if (filterOpen) setFilter(""); }}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                filterOpen || filter
                  ? "bg-violet-500/20 text-violet-400"
                  : dark ? "text-neutral-400 hover:text-neutral-300" : "text-slate-600 hover:text-slate-700",
              )}
            >
              {t("board.filter")}
            </button>
          }
        />
        {boardOpen ? (
          <div className={cn("space-y-3 p-3 text-sm", expandedPanelClass)}>
            {filterOpen && (
              <div className="relative">
                <input
                  autoFocus
                  className={cn(
                    "w-full rounded border py-1 pl-2 pr-7 text-xs outline-none focus:border-violet-500",
                    dark ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                  )}
                  placeholder={t("board.filterPlaceholder")}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {filter && (
                  <button onClick={() => setFilter("")} aria-label={t("board.clearFilter")} className={cn("absolute right-2 top-1/2 -translate-y-1/2", subduedTextClass)}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className={cn("flex items-center justify-between", subduedTextClass)}>
              <span>{t("board.epicsCount", { n: epicCount })}</span>
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                  onClick={() => setCreateEpicOpen(true)}
                >
                  <Plus className="size-3" /> {t("board.createEpicTitle")}
                </button>
                <button
                  className={cn(
                    "flex items-center gap-1 rounded border px-2 py-1.5 transition-colors hover:border-violet-500/50",
                    dark ? "border-neutral-600 text-neutral-300 hover:text-violet-300" : "border-slate-300 text-slate-600 hover:text-violet-600",
                  )}
                  onClick={() => toast.promise(board.refetch(), { loading: t("board.refreshing"), success: t("board.boardRefreshed"), error: t("board.boardRefreshFailed") })}
                  aria-label={t("board.refreshBoardAria")}
                >
                  <RefreshCw className="size-3" />
                </button>
              </div>
            </div>
            {storyStats.data && storyStats.data.total > 0 ? (
              <div className={cn("rounded border p-2", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className={cn("text-xs font-semibold uppercase tracking-wide", dark ? "text-neutral-500" : "text-slate-500")}>{t("board.storyProgress")}</div>
                  {storyIndexSyncedAt ? (
                    <div className={cn("text-xs", dark ? "text-neutral-600" : "text-slate-400")}>
                      {t("board.syncedAt", { time: storyIndexSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {(
                    [
                      { labelKey: "board.phase2Designed" as const, count: storyStats.data.phase2_designed },
                      { labelKey: "board.phase3Proposed" as const, count: storyStats.data.phase3_proposed },
                      { labelKey: "board.phase4Tested" as const,   count: storyStats.data.phase4_tested },
                      { labelKey: "board.phase5Deployed" as const, count: storyStats.data.phase5_deployed },
                    ] as const
                  ).map(({ labelKey, count }) => (
                    <div key={labelKey} className="flex items-center gap-2">
                      <div className={cn("w-24 shrink-0 text-xs", dark ? "text-neutral-400" : "text-slate-600")}>{t(labelKey)}</div>
                      <div className={cn("relative h-1.5 flex-1 rounded-full", dark ? "bg-neutral-700" : "bg-slate-200")}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-violet-500"
                          style={{ width: `${Math.round((count / storyStats.data!.total) * 100)}%` }}
                        />
                      </div>
                      <div className={cn("w-8 text-right text-xs", dark ? "text-neutral-400" : "text-slate-500")}>{count}/{storyStats.data.total}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {(() => {
              if (!board.data || !storyStats.data) return null;
              const boardTotal = board.data.reduce((sum, epic) => sum + epic.stories.length, 0);
              const indexTotal = storyStats.data.total;
              if (boardTotal === indexTotal) return null;
              return (
                <div className={cn("flex items-center justify-between rounded border px-2 py-1.5 text-xs", dark ? "border-amber-700/50 bg-amber-950/30 text-amber-300" : "border-amber-400/50 bg-amber-50 text-amber-700")}>
                  <span>{t("board.storyIndexOutOfSync", { board: boardTotal, indexed: indexTotal })}</span>
                  <button
                    className="ml-2 shrink-0 rounded px-1.5 py-0.5 font-semibold underline hover:no-underline disabled:opacity-50"
                    disabled={rebuildIndex.isPending}
                    onClick={() => rebuildIndex.mutate(undefined, {
                      onSuccess: () => { setStoryIndexSyncedAt(new Date()); toast.success(t("board.storyIndexRebuilt")); },
                      onError: () => toast.error(t("board.storyIndexRebuildFailed")),
                    })}
                  >
                    {rebuildIndex.isPending ? t("board.rebuilding") : t("board.rebuild")}
                  </button>
                </div>
              );
            })()}
            {board.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-6 w-4/5" />
              </div>
            ) : null}
            {board.isError ? (
              <div className={cn("flex items-center justify-between gap-2 rounded border px-2.5 py-2 text-xs", dark ? "border-red-900/50 text-red-400" : "border-red-200 text-red-600")}>
                <span>{t("board.failedLoadBoard")}</span>
                <button onClick={() => board.refetch()} className="shrink-0 font-semibold underline">{t("common.retry")}</button>
              </div>
            ) : null}
            {!board.isLoading && !board.isError && q && filteredBoard.length === 0 && (
              <div className={subduedTextClass}>{t("board.noMatches")}</div>
            )}
            {!board.isLoading && !board.isError && filteredBoard.map((epic) => (
              <div key={epic.id}>
                <div className="flex w-full items-center gap-1">
                  <button
                    className={cn("flex flex-1 items-center gap-1 text-left font-semibold transition-colors hover:text-violet-300", strongTextClass)}
                    onClick={() => setExpandedEpic(expandedEpic === epic.id ? null : epic.id)}
                  >
                    {expandedEpic === epic.id ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <span className="font-mono">#{epic.ref}</span> {epic.subject}
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
                    onClick={() => setDialogEpic(epic)}
                    title={t("board.editEpic")}
                  >
                    <Info className="size-3" />
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded text-red-400 transition-colors hover:bg-red-500/20"
                    onClick={() => confirm(t("board.deleteEpicConfirm", { subject: epic.subject }), () => deleteEpic.mutate(epic.id))}
                    title={t("board.deleteEpic")}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                {expandedEpic === epic.id ? (
                  <div className={cn("mt-2 space-y-2 pl-4", bodyTextClass)}>
                    <button
                      className="flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                      onClick={() => setCreateStoryEpicId(epic.id)}
                    >
                      <Plus className="size-3" /> {t("board.storyButton")}
                    </button>
                    {epic.stories.map((story) => (
                      <div key={story.id}>
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-xs"><span className="font-mono">#{story.ref}</span> {story.subject}</span>
                          {(() => {
                            const r = riskById.get(story.id);
                            return r && (r.level === "high" || r.level === "medium") ? (
                              <span
                                title={t("board.riskTitle", { level: r.level, reasons: r.reasons.join("; ") })}
                                aria-label={t("board.predictedRiskAria", { level: r.level })}
                                className={cn(
                                  "size-2 shrink-0 rounded-full",
                                  r.level === "high" ? "bg-red-500" : "bg-amber-500",
                                )}
                              />
                            ) : null;
                          })()}
                          {regressedIds.has(story.id) ? (
                            <TrendingDown
                              className="size-3 shrink-0 text-red-500"
                              aria-label={t("board.regressedAria")}
                            />
                          ) : null}
                          {tracedIds.has(story.id) ? (
                            <Undo2
                              className="size-3 shrink-0 text-violet-500"
                              aria-label={t("board.tracedAria")}
                            />
                          ) : null}
                          {figmaById.has(story.id) ? (
                            <Figma
                              className={cn("size-3 shrink-0", figmaChangedIds.has(story.id) ? "text-amber-500" : "text-violet-400")}
                              aria-label={figmaChangedIds.has(story.id) ? t("board.figmaChangedAria") : t("board.figmaLinkedAria")}
                            />
                          ) : null}
                          <button
                            className="grid size-5 place-items-center rounded text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
                            onClick={() => setDialogStory(story)}
                            title={t("board.editStory")}
                          >
                            <Info className="size-3" />
                          </button>
                          <button
                            className="grid size-5 place-items-center rounded text-red-400 transition-colors hover:bg-red-500/20"
                            onClick={() => confirm(t("board.deleteStoryConfirm", { subject: story.subject }), () => deleteStory.mutate(story.id))}
                            title={t("board.deleteStory")}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!board.isLoading && !board.isError && !board.data?.length ? <div className={subduedTextClass}>{t("board.noEpicsYet")}</div> : null}

          </div>
        ) : null}
      </section>
    </div>
  );
}
