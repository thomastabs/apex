"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight, Figma, GitBranch, Github, Loader2, Plus, ShieldCheck, Trash2, Zap,
} from "lucide-react";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  useClassifyItem,
  useClassifyPlacement,
  useCreateMaintenanceItem,
  useDeleteMaintenanceItem,
  useDiagnoseItem,
  useFixBriefItem,
  useMaintenanceItems,
  useResolveItem,
  useRouteItem,
} from "@/lib/hooks/use-phase6";
import { usePhase1Epics } from "@/lib/hooks/use-phase1";
import type { ExistingEpicInput } from "@/lib/api/phase1";
import { suggestLane } from "@/lib/api/phase6";
import { getAnalyticsSummary } from "@/lib/api/analytics";
import { useApiContext, useFigmaContext, useGithubContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { usePhase1IntakeStore } from "@/lib/stores/phase1-intake-store";
import { buildMaintenanceIntakeNlDraft } from "@/lib/phase1-onboarding";
import { useT } from "@/lib/i18n/use-translation";
import { cn, errMsg } from "@/lib/utils";
import type { ExternalIssue } from "@/lib/api/github-browser";
import type { MaintenanceItem } from "@/lib/api/types";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";
import { useGroundingFiles } from "@/lib/hooks/use-grounding-files";

const STATUS_LABEL: Record<string, string> = {
  new: "New", routed_to_discovery: "→ Discovery", diagnosed: "Diagnosed",
  fix_ready: "Fix ready", resolved: "Resolved",
};

function StatusChip({ item, dark }: { item: MaintenanceItem; dark: boolean }) {
  const tone =
    item.status === "resolved" ? "bg-emerald-500/15 text-emerald-500"
    : item.classification === "change_request" ? (dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")
    : item.classification === "bug" ? "bg-amber-500/15 text-amber-500"
    : dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500";
  return <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", tone)}>{STATUS_LABEL[item.status] ?? item.status}</span>;
}

export function MaintenanceTriage() {
  const t = useT();
  const context = useApiContext();
  const github = useGithubContext();
  const figma = useFigmaContext();
  const dark = useUiStore((s) => s.theme) === "dark";
  const router = useRouter();

  const itemsQuery = useMaintenanceItems();
  const create = useCreateMaintenanceItem();
  const del = useDeleteMaintenanceItem();
  const classify = useClassifyItem();
  const diagnose = useDiagnoseItem();
  const fixBrief = useFixBriefItem();
  const route = useRouteItem();
  const resolve = useResolveItem();
  const classifyPlacement = useClassifyPlacement();
  // Same query as phase1-workflow.tsx's usePhase1Epics() - shares the cache
  // key, so this never fetches the board a second way.
  const epics = usePhase1Epics();

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  // intake form
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [linkedStory, setLinkedStory] = useState("");

  // diagnosis input + lane suggestion
  const [snippet, setSnippet] = useState("");
  const [laneHint, setLaneHint] = useState<{ lane: string; rationale: string } | null>(null);
  const [triageExtraContext, setTriageExtraContext] = useState<string[]>([]);
  const [diagnosisExtraContext, setDiagnosisExtraContext] = useState<string[]>([]);
  const [fixBriefExtraContext, setFixBriefExtraContext] = useState<string[]>([]);
  const [placementExtraContext, setPlacementExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();

  // Path A: change-request placement review - an editable proposal, never
  // auto-applied. null = not yet reviewed (show the Analyze/Skip actions);
  // non-null = the human-reviewable form, seeded either by the AI or by the
  // no-AI fallback, shown right up until "Continue to Phase 1".
  const [placementReview, setPlacementReview] = useState<{
    isNewEpic: boolean;
    matchedEpicTitle: string;
    epicTitle: string;
    storyTitle: string;
    storyDescription: string;
    rationale: string;
  } | null>(null);

  // issue import
  const [issues, setIssues] = useState<{ source: "github" | "taiga" | "plane" | "figma"; list: ExternalIssue[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Manual override per issue (ext_ref -> story id, "" = explicitly unlinked).
  // Unset entries fall back to suggestStory's word-overlap guess at render time.
  const [issueLinks, setIssueLinks] = useState<Record<string, number | "">>({});

  // Deployed stories, for the "link to story" picker next to each importable
  // issue — this is what lets an import feed AnalyticsService's escape-rate
  // calc instead of sitting unlinked. staleTime matches analytics-dashboard.
  const deployedStoriesQuery = useQuery({
    queryKey: ["analytics", "summary", "deployed-stories", context?.projectId],
    queryFn: () => getAnalyticsSummary(context!),
    enabled: Boolean(context),
    staleTime: 30 * 1000,
    select: (d) => d.stories.filter((s) => s.phase_status === "deployed"),
  });
  const deployedStories = deployedStoriesQuery.data ?? [];

  useEffect(() => {
    if (selectedId === null && items.length > 0) setSelectedId(items[0].id);
  }, [items, selectedId]);

  if (!context) {
    return <div className="p-8"><Callout variant="warning">Sign in and select a project to triage maintenance feedback.</Callout></div>;
  }

  function submitNew() {
    if (!subject.trim()) { toast.error("Subject required."); return; }
    create.mutate(
      { subject, description, evidence, source: "manual", linked_story_id: linkedStory ? Number(linkedStory) : null },
      {
        onSuccess: (it) => {
          toast.success("Maintenance item created.");
          setShowForm(false); setSubject(""); setDescription(""); setEvidence(""); setLinkedStory("");
          setSelectedId(it.id);
        },
      },
    );
  }

  async function syncGithub() {
    if (!github) { toast.error("Connect a GitHub repo first."); return; }
    setSyncing(true);
    try {
      const { fetchGithubIssues } = await import("@/lib/api/github-browser");
      setIssues({ source: "github", list: await fetchGithubIssues(github) });
    } catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  }

  async function syncTaiga() {
    if (context!.pmTool !== "taiga" || !context!.projectId) { toast.error("Taiga project required."); return; }
    setSyncing(true);
    try {
      const { taigaListIssues } = await import("@/lib/api/taiga-direct");
      setIssues({ source: "taiga", list: await taigaListIssues(context!.taigaToken, context!.projectId, context!.taigaApiUrl) });
    } catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  }

  async function syncPlane() {
    if (context!.pmTool !== "plane" || !context!.projectId || !context!.workspaceSlug) { toast.error("Plane project required."); return; }
    setSyncing(true);
    try {
      const { planeListIssues, resolveId } = await import("@/lib/api/plane-direct");
      const projectUuid = resolveId(context!.projectId);
      setIssues({ source: "plane", list: await planeListIssues(context!.taigaToken, context!.workspaceSlug, projectUuid, context!.taigaApiUrl) });
    } catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  }

  function deleteItem(it: MaintenanceItem) {
    if (!window.confirm(`Delete maintenance item #${it.id} "${it.subject}"? This cannot be undone.`)) return;
    del.mutate(it.id, {
      onSuccess: () => {
        toast.success(`Deleted #${it.id}`);
        if (selectedId === it.id) setSelectedId(null);
      },
    });
  }

  async function syncFigma() {
    if (!figma) { toast.error("Connect a Figma file first."); return; }
    setSyncing(true);
    try {
      const { figmaSyncIssues } = await import("@/lib/api/figma");
      setIssues({ source: "figma", list: await figmaSyncIssues(figma.token, figma.fileKey) });
    } catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  }

  /** Naive word-overlap guess so the picker isn't empty by default — always
   *  human-reviewable before Import, never auto-applied silently. */
  function suggestStory(subject: string): number | "" {
    const words = new Set(subject.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    if (words.size === 0) return "";
    let best: { id: number; score: number } | null = null;
    for (const s of deployedStories) {
      const titleWords = s.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const score = titleWords.filter((w) => words.has(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { id: s.story_id, score };
    }
    return best?.id ?? "";
  }

  function linkedStoryFor(iss: ExternalIssue): number | "" {
    return issueLinks[iss.ext_ref] ?? suggestStory(iss.subject);
  }

  function importIssue(src: "github" | "taiga" | "plane" | "figma", iss: ExternalIssue) {
    const linked = linkedStoryFor(iss);
    create.mutate(
      {
        subject: iss.subject, description: iss.description, source: src, ext_ref: iss.ext_ref,
        linked_story_id: linked === "" ? null : linked,
        detected_at: iss.created_at ?? "",
        severity: iss.severity ?? "",
      },
      { onSuccess: (it) => { toast.success(`Imported ${iss.ext_ref}`); setSelectedId(it.id); } },
    );
  }

  // Same truncation caps as phase1-workflow.tsx's runGapAnalysis - this is
  // the same "existing epics" snapshot shape the backend's ExistingEpicSchema
  // enforces (title 500, description 20_000, 200 stories per epic).
  function existingEpicsSnapshot(): ExistingEpicInput[] {
    return (epics.data ?? []).map((epic) => ({
      title: (epic.subject ?? "").slice(0, 500),
      description: (epic.description ?? "").slice(0, 20_000),
      stories: epic.stories.slice(0, 200).map((s) => s.subject),
    }));
  }

  // No-AI fallback: the raw item content, proposed as a new epic. Used both
  // when the human explicitly skips AI placement and when the AI call fails -
  // either way the review form still appears, seeded from real content,
  // never a silently blank handoff.
  function fallbackPlacement(item: MaintenanceItem) {
    return {
      isNewEpic: true,
      matchedEpicTitle: epics.data?.[0]?.subject ?? "",
      epicTitle: item.subject,
      storyTitle: item.subject,
      storyDescription: item.description,
      rationale: "",
    };
  }

  function analyzePlacement() {
    if (!selected) return;
    classifyPlacement.mutate(
      { itemId: selected.id, existingEpics: existingEpicsSnapshot(), extraContextFiles: placementExtraContext },
      {
        onSuccess: (result) => {
          // Grounding safety net: never trust a "matched" epic title the AI
          // returned if it isn't actually one of the epics we gave it.
          const matched = result.matched_epic_title
            && epics.data?.some((e) => e.subject === result.matched_epic_title)
            ? result.matched_epic_title
            : null;
          setPlacementReview({
            isNewEpic: result.is_new_epic || !matched,
            matchedEpicTitle: matched ?? (epics.data?.[0]?.subject ?? ""),
            epicTitle: result.suggested_epic_title || selected.subject,
            storyTitle: result.suggested_story_title || selected.subject,
            storyDescription: result.suggested_story_description || selected.description,
            rationale: result.rationale,
          });
        },
        // Global error toast already fires (meta.errorLabel); this is the
        // non-toast local-state fallback so the user is never left staring
        // at a dead end when the AI call itself fails.
        onError: () => setPlacementReview(fallbackPlacement(selected)),
      },
    );
  }

  function skipAiPlacement() {
    if (!selected) return;
    setPlacementReview(fallbackPlacement(selected));
  }

  function continueToPhase1() {
    if (!placementReview || !selected) return;
    const matchedEpic = !placementReview.isNewEpic
      ? epics.data?.find((e) => e.subject === placementReview.matchedEpicTitle)
      : undefined;
    const nlDraft = buildMaintenanceIntakeNlDraft({
      storyTitle: placementReview.storyTitle,
      storyDescription: placementReview.storyDescription,
      subject: selected.subject,
      description: selected.description,
    });
    usePhase1IntakeStore.getState().setPending({
      mode: matchedEpic ? "load" : "create",
      epicId: matchedEpic ? matchedEpic.id : null,
      epicTitle: matchedEpic ? matchedEpic.subject : placementReview.epicTitle,
      nlDraft,
      fromMaintenanceItemId: selected.id,
    });
    router.push("/phase1");
  }

  const busy = classify.isPending || diagnose.isPending || fixBrief.isPending;
  const muted = dark ? "text-neutral-500" : "text-slate-400";
  const cardBorder = dark ? "border-neutral-800" : "border-slate-200";

  return (
    <div className="space-y-5">
      <SectionHeading>{t("phase6.feedbackHeading")}</SectionHeading>
      <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-600")}>
        {t("phase6.feedbackDesc")}
      </p>

      <div className={cn("grid grid-cols-1 gap-2 text-xs md:grid-cols-3", muted)}>
        <div className={cn("rounded-md border px-3 py-2", cardBorder)}>
          <span className="font-semibold text-violet-500">{t("phase6.route.changeRequest")}</span>
          <span className="mt-0.5 block">{t("phase6.route.changeRequestDesc")}</span>
        </div>
        <div className={cn("rounded-md border px-3 py-2", cardBorder)}>
          <span className="font-semibold text-amber-500">{t("phase6.route.bug")}</span>
          <span className="mt-0.5 block">{t("phase6.route.bugDesc")}</span>
        </div>
        <div className={cn("rounded-md border px-3 py-2", cardBorder)}>
          <span className="font-semibold text-emerald-500">{t("phase6.route.resolve")}</span>
          <span className="mt-0.5 block">{t("phase6.route.resolveDesc")}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> New item</Button>
        <Button variant="secondary" onClick={syncGithub} disabled={syncing || !github}>
          <Github className="h-4 w-4" /> Sync GitHub Issues
        </Button>
        <Button variant="secondary" onClick={syncFigma} disabled={syncing || !figma}>
          <Figma className="h-4 w-4" /> Sync Figma Comments
        </Button>
        {context.pmTool === "plane" ? (
          <Button variant="secondary" onClick={syncPlane} disabled={syncing}>
            <GitBranch className="h-4 w-4" /> Sync Plane Issues
          </Button>
        ) : (
          <Button variant="secondary" onClick={syncTaiga} disabled={syncing}>
            <GitBranch className="h-4 w-4" /> Sync Taiga Issues
          </Button>
        )}
      </div>

      {showForm ? (
        <div className={cn("space-y-2 rounded-lg border p-4", cardBorder)}>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Description / what the user reports" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Textarea placeholder="Evidence (stack trace, QA notes) — optional" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <Input placeholder="Linked deployed story id (optional)" value={linkedStory} onChange={(e) => setLinkedStory(e.target.value.replace(/[^0-9]/g, ""))} />
          <Button onClick={submitNew} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
        </div>
      ) : null}

      {issues ? (
        <div className={cn("space-y-1 rounded-lg border p-3", cardBorder)}>
          <p className={cn("text-xs font-semibold", muted)}>{issues.source} issues ({issues.list.length})</p>
          {issues.list.length === 0 ? <p className={cn("text-xs", muted)}>No open issues.</p> : null}
          {issues.list.map((iss) => (
            <div key={iss.ext_ref} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {iss.ext_ref} — {iss.subject}
                {iss.severity ? <span className={cn("ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>{iss.severity}</span> : null}
              </span>
              <select
                className={cn("shrink-0 rounded border bg-transparent px-1 py-0.5 text-xs", cardBorder)}
                value={linkedStoryFor(iss)}
                onChange={(e) => setIssueLinks((m) => ({ ...m, [iss.ext_ref]: e.target.value ? Number(e.target.value) : "" }))}
                title="Link this issue to the deployed story it's a defect against — feeds the AI Defect Escape Rate."
              >
                <option value="">No linked story</option>
                {deployedStories.map((s) => (
                  <option key={s.story_id} value={s.story_id}>#{s.story_id} {s.title}</option>
                ))}
              </select>
              <button className="shrink-0 text-xs font-semibold text-violet-500 hover:underline" onClick={() => importIssue(issues.source, iss)}>Import</button>
            </div>
          ))}
        </div>
      ) : null}

      {itemsQuery.isLoading ? (
        <Callout>Loading items…</Callout>
      ) : items.length === 0 ? (
        <Callout>No maintenance items yet. Add one or sync issues.</Callout>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[18rem_1fr]">
          {/* item list */}
          <div className="space-y-1">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => { setSelectedId(it.id); setLaneHint(null); setSnippet(""); setPlacementReview(null); classifyPlacement.reset(); }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                  selectedId === it.id ? "border-violet-500 bg-violet-500/10"
                    : dark ? "border-neutral-800 hover:bg-neutral-900" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate", dark ? "text-neutral-200" : "text-slate-800")}><span className="font-mono">#{it.id}</span> {it.subject}</span>
                  <span className={cn("block truncate text-xs", muted)}>{it.source}{it.ext_ref ? ` · ${it.ext_ref}` : ""}{it.linked_story_id ? <> · story <span className="font-mono">#{it.linked_story_id}</span></> : ""}</span>
                </span>
                <StatusChip item={it} dark={dark} />
              </button>
            ))}
          </div>

          {/* detail */}
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className={cn("text-base font-bold", dark ? "text-white" : "text-slate-900")}><span className="font-mono">#{selected.id}</span> {selected.subject}</h3>
                  {selected.description ? <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-600")}>{selected.description}</p> : null}
                </div>
                <Button
                  variant="danger"
                  onClick={() => deleteItem(selected)}
                  disabled={del.isPending}
                  title="Delete this maintenance item"
                  className="shrink-0"
                >
                  {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
              </div>

              {/* F1 classify */}
              {selected.classification === "unclassified" ? (
                <>
                  <div className="flex gap-2">
                    <Button onClick={() => classify.mutate({ itemId: selected.id, extraContextFiles: triageExtraContext })} disabled={busy}>
                      {classify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Classify (Triage)
                    </Button>
                    {classify.isPending && <CancelButton onCancel={() => classify.cancel()} />}
                  </div>
                  <AiGroundingNote
                    files={AI_GROUNDING.maintenanceTriage}
                    dark={dark}
                    availableFiles={availableGroundingFiles}
                    selectedExtraFiles={triageExtraContext}
                    onSelectedExtraFilesChange={setTriageExtraContext}
                  />
                </>
              ) : null}

              {selected.ai_rationale?.classify ? (
                <div className={cn("rounded-lg border p-3 text-sm", cardBorder)}>
                  <span className="font-semibold">{selected.classification === "change_request" ? "Change Request" : "Bug"}:</span>{" "}
                  {selected.ai_rationale.classify}
                </div>
              ) : null}

              {/* Path A: routed to discovery - propose a placement, human reviews/edits, then hand off to Phase 1 */}
              {selected.classification === "change_request" ? (
                <Callout>
                  <div className="space-y-3">
                    <p>{t("phase6.placement.routedNotice")}</p>

                    {!placementReview ? (
                      <>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button onClick={analyzePlacement} disabled={classifyPlacement.isPending}>
                            {classifyPlacement.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {classifyPlacement.isPending ? t("common.analyzing") : t("phase6.placement.analyzeButton")}
                          </Button>
                          {classifyPlacement.isPending && <CancelButton onCancel={() => classifyPlacement.cancel()} />}
                          <button
                            type="button"
                            className="text-xs font-semibold text-violet-500 hover:underline disabled:opacity-50"
                            onClick={skipAiPlacement}
                            disabled={classifyPlacement.isPending}
                          >
                            {t("phase6.placement.skipAi")}
                          </button>
                        </div>
                        <AiGroundingNote
                          files={AI_GROUNDING.maintenancePlacement}
                          dark={dark}
                          availableFiles={availableGroundingFiles}
                          selectedExtraFiles={placementExtraContext}
                          onSelectedExtraFilesChange={setPlacementExtraContext}
                        />
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className={cn("text-sm", dark ? "text-neutral-300" : "text-slate-700")}>
                          <span className="font-semibold">
                            {placementReview.isNewEpic
                              ? t("phase6.placement.newEpicVerdict", { title: placementReview.epicTitle || t("phase6.placement.untitled") })
                              : t("phase6.placement.existingEpicVerdict", { title: placementReview.matchedEpicTitle })}
                          </span>
                          {placementReview.rationale ? <> - {placementReview.rationale}</> : null}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={cn(
                              "rounded border px-2 py-1 text-xs font-semibold",
                              placementReview.isNewEpic ? "border-violet-500 text-violet-500" : cardBorder,
                            )}
                            onClick={() => setPlacementReview((p) => (p ? { ...p, isNewEpic: true } : p))}
                          >
                            {t("phase6.placement.newEpicOption")}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "rounded border px-2 py-1 text-xs font-semibold disabled:opacity-40",
                              !placementReview.isNewEpic ? "border-violet-500 text-violet-500" : cardBorder,
                            )}
                            disabled={!epics.data?.length}
                            title={!epics.data?.length ? t("phase6.placement.noEpicsHint") : undefined}
                            onClick={() =>
                              setPlacementReview((p) =>
                                p ? { ...p, isNewEpic: false, matchedEpicTitle: p.matchedEpicTitle || epics.data?.[0]?.subject || "" } : p,
                              )
                            }
                          >
                            {t("phase6.placement.existingEpicOption")}
                          </button>
                        </div>
                        {!epics.data?.length ? <p className={cn("text-xs", muted)}>{t("phase6.placement.noEpicsHint")}</p> : null}

                        {placementReview.isNewEpic ? (
                          <Input
                            placeholder={t("phase6.placement.epicTitleLabel")}
                            value={placementReview.epicTitle}
                            onChange={(e) => setPlacementReview((p) => (p ? { ...p, epicTitle: e.target.value } : p))}
                          />
                        ) : (
                          <select
                            className={cn("w-full rounded border bg-transparent px-2 py-1.5 text-sm", cardBorder)}
                            value={placementReview.matchedEpicTitle}
                            onChange={(e) => setPlacementReview((p) => (p ? { ...p, matchedEpicTitle: e.target.value } : p))}
                          >
                            {(epics.data ?? []).map((epic) => (
                              <option key={epic.id} value={epic.subject}>{epic.subject}</option>
                            ))}
                          </select>
                        )}

                        <Input
                          placeholder={t("phase6.placement.storyTitleLabel")}
                          value={placementReview.storyTitle}
                          onChange={(e) => setPlacementReview((p) => (p ? { ...p, storyTitle: e.target.value } : p))}
                        />
                        <Textarea
                          rows={2}
                          placeholder={t("phase6.placement.storyDescriptionLabel")}
                          value={placementReview.storyDescription}
                          onChange={(e) => setPlacementReview((p) => (p ? { ...p, storyDescription: e.target.value } : p))}
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button onClick={continueToPhase1}>
                            {t("phase6.placement.continueButton")} <ArrowRight className="inline h-3 w-3" />
                          </Button>
                          <Button variant="secondary" onClick={() => setPlacementReview(null)}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Callout>
              ) : null}

              {/* Path B: diagnose */}
              {selected.classification === "bug" && !selected.diagnosis_md ? (
                <div className="space-y-2">
                  <p className={cn("text-xs", muted)}>Narrow diagnosis (Context Isolation): paste ONLY the implicated code snippet.</p>
                  <Textarea placeholder="Isolated code snippet" rows={4} value={snippet} onChange={(e) => setSnippet(e.target.value)} />
                  <div className="flex gap-2">
                    <Button onClick={() => diagnose.mutate({ itemId: selected.id, codeSnippet: snippet, extraContextFiles: diagnosisExtraContext })} disabled={busy}>
                      {diagnose.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Diagnose
                    </Button>
                    {diagnose.isPending && <CancelButton onCancel={() => diagnose.cancel()} />}
                  </div>
                  <AiGroundingNote
                    files={AI_GROUNDING.maintenanceDiagnosis}
                    dark={dark}
                    availableFiles={availableGroundingFiles}
                    selectedExtraFiles={diagnosisExtraContext}
                    onSelectedExtraFilesChange={setDiagnosisExtraContext}
                  />
                </div>
              ) : null}

              {selected.diagnosis_md ? (
                <div className={cn("whitespace-pre-wrap rounded-lg border p-3 text-xs", cardBorder, dark ? "bg-neutral-950 text-neutral-300" : "bg-slate-50 text-slate-700")}>
                  {selected.diagnosis_md}
                </div>
              ) : null}

              {/* F2: fix brief */}
              {selected.status === "diagnosed" ? (
                <>
                  <div className="flex gap-2">
                    <Button onClick={() => fixBrief.mutate({ itemId: selected.id, extraContextFiles: fixBriefExtraContext })} disabled={busy}>
                      {fixBrief.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generate Fix-Bolt Brief
                    </Button>
                    {fixBrief.isPending && <CancelButton onCancel={() => fixBrief.cancel()} />}
                  </div>
                  <AiGroundingNote
                    files={AI_GROUNDING.maintenanceFixBrief}
                    dark={dark}
                    availableFiles={availableGroundingFiles}
                    selectedExtraFiles={fixBriefExtraContext}
                    onSelectedExtraFilesChange={setFixBriefExtraContext}
                  />
                </>
              ) : null}

              {selected.fix_brief_md ? (
                <div className="space-y-2">
                  <div className={cn("whitespace-pre-wrap rounded-lg border p-3 text-xs", cardBorder, dark ? "bg-neutral-950 text-neutral-300" : "bg-slate-50 text-slate-700")}>
                    {selected.fix_brief_md}
                  </div>
                  <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(selected.fix_brief_md); toast.success("Copied."); }}>Copy brief</Button>
                </div>
              ) : null}

              {/* F2: severity routing */}
              {selected.status === "fix_ready" || selected.lane ? (
                <div className={cn("space-y-2 rounded-lg border p-3", cardBorder)}>
                  <p className="text-sm font-semibold">Severity routing</p>
                  {selected.severity ? (
                    <p className={cn("text-xs", muted)}>PM-reported severity: <b>{selected.severity}</b> — ground truth, not the AI&apos;s guess below.</p>
                  ) : null}
                  {!laneHint ? (
                    <>
                      <button className="text-xs font-semibold text-violet-500 hover:underline"
                        onClick={async () => { try { setLaneHint(await suggestLane(context, selected.id)); } catch (e) { toast.error(errMsg(e)); } }}>
                        Suggest lane (AI)
                      </button>
                      <AiGroundingNote files={AI_GROUNDING.maintenanceFixBrief} dark={dark} className="mt-1" />
                    </>
                  ) : (
                    <p className={cn("text-xs", muted)}>AI suggests <b>{laneHint.lane}</b>: {laneHint.rationale}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!window.confirm("Route to Fast Lane? This skips QA entirely and deploys the fix directly to production.")) return;
                        route.mutate({ itemId: selected.id, lane: "fast" });
                      }}
                      disabled={route.isPending}
                    >
                      {route.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Fast Lane
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!window.confirm("Route to Secure Lane? This deploys with a QA regression bypass — only previously-failed scenarios get re-tested.")) return;
                        route.mutate({ itemId: selected.id, lane: "secure" });
                      }}
                      disabled={route.isPending}
                    >
                      {route.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Secure Lane
                    </Button>
                  </div>
                  {selected.lane ? <p className={cn("text-xs", muted)}>Routed: <b>{selected.lane}</b> lane.</p> : null}
                </div>
              ) : null}

              {/* resolve (Fix Log) */}
              {selected.status !== "resolved" && selected.classification === "bug" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!window.confirm("Mark this item resolved? This writes a permanent record to fix-log.md.")) return;
                    resolve.mutate({ itemId: selected.id });
                  }}
                  disabled={resolve.isPending}
                >
                  {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Resolve (record fix)
                </Button>
              ) : null}
              {selected.status === "resolved" ? <Callout variant="success">Resolved — fix recorded in fix-log.md.</Callout> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
