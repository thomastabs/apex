"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight, Figma, GitBranch, Github, Loader2, Plus, ShieldCheck, Trash2, Zap,
} from "lucide-react";
import { Button, Callout, Input, SectionHeading, Textarea } from "@/components/ui/primitives";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  useClassifyItem,
  useCreateMaintenanceItem,
  useDeleteMaintenanceItem,
  useDiagnoseItem,
  useFixBriefItem,
  useMaintenanceItems,
  useResolveItem,
  useRouteItem,
} from "@/lib/hooks/use-phase6";
import { suggestLane } from "@/lib/api/phase6";
import { useApiContext, useFigmaContext, useGithubContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import type { ExternalIssue } from "@/lib/api/github-browser";
import type { MaintenanceItem } from "@/lib/api/types";

const STATUS_LABEL: Record<string, string> = {
  new: "New", routed_to_discovery: "→ Discovery", diagnosed: "Diagnosed",
  fix_ready: "Fix ready", resolved: "Resolved",
};

function StatusChip({ item, dark }: { item: MaintenanceItem; dark: boolean }) {
  const tone =
    item.status === "resolved" ? "bg-emerald-500/15 text-emerald-500"
    : item.classification === "change_request" ? "bg-sky-500/15 text-sky-500"
    : item.classification === "bug" ? "bg-amber-500/15 text-amber-500"
    : dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500";
  return <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", tone)}>{STATUS_LABEL[item.status] ?? item.status}</span>;
}

export function MaintenanceTriage() {
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

  // issue import
  const [issues, setIssues] = useState<{ source: "github" | "taiga" | "jira" | "figma"; list: ExternalIssue[] } | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (selectedId === null && items.length > 0) setSelectedId(items[0].id);
  }, [items, selectedId]);

  if (!context) {
    return <div className="p-8"><Callout>Sign in and select a project to triage maintenance feedback.</Callout></div>;
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
        onError: (e) => toast.error(errMsg(e)),
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

  async function syncJira() {
    if (context!.pmTool !== "jira" || !context!.projectId) { toast.error("Jira project required."); return; }
    setSyncing(true);
    try {
      const { jiraListIssues } = await import("@/lib/api/jira-adapter");
      const { toPmCtx } = await import("@/lib/api/workspace");
      setIssues({ source: "jira", list: await jiraListIssues(toPmCtx(context!)) });
    } catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  }

  function deleteItem(it: MaintenanceItem) {
    if (!window.confirm(`Delete maintenance item #${it.id} "${it.subject}"? This cannot be undone.`)) return;
    del.mutate(it.id, {
      onSuccess: () => {
        toast.success(`Deleted #${it.id}`);
        if (selectedId === it.id) setSelectedId(null);
      },
      onError: (e) => toast.error(errMsg(e)),
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

  function importIssue(src: "github" | "taiga" | "jira" | "figma", iss: ExternalIssue) {
    create.mutate(
      { subject: iss.subject, description: iss.description, source: src, ext_ref: iss.ext_ref },
      { onSuccess: (it) => { toast.success(`Imported ${iss.ext_ref}`); setSelectedId(it.id); }, onError: (e) => toast.error(errMsg(e)) },
    );
  }

  const busy = classify.isPending || diagnose.isPending || fixBrief.isPending;
  const muted = dark ? "text-neutral-500" : "text-slate-400";
  const cardBorder = dark ? "border-neutral-800" : "border-slate-200";

  return (
    <div className="space-y-5">
      <SectionHeading>Maintenance Triage — Feedback to Fix-Bolt</SectionHeading>
      <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-600")}>
        Classify post-deployment feedback: Change Requests route to discovery; bugs get a narrow,
        context-isolated diagnosis, a Fix-Bolt brief, a Fix Log entry, and severity routing.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> New item</Button>
        <Button variant="secondary" onClick={syncGithub} disabled={syncing || !github}>
          <Github className="h-4 w-4" /> Sync GitHub Issues
        </Button>
        <Button variant="secondary" onClick={syncFigma} disabled={syncing || !figma}>
          <Figma className="h-4 w-4" /> Sync Figma Comments
        </Button>
        {context.pmTool === "jira" ? (
          <Button variant="secondary" onClick={syncJira} disabled={syncing}>
            <GitBranch className="h-4 w-4" /> Sync Jira Issues
          </Button>
        ) : (
          <Button variant="secondary" onClick={syncTaiga} disabled={syncing || context.pmTool !== "taiga"}>
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
              <span className="min-w-0 flex-1 truncate">{iss.ext_ref} — {iss.subject}</span>
              <button className="text-xs font-semibold text-violet-500 hover:underline" onClick={() => importIssue(issues.source, iss)}>Import</button>
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
                onClick={() => { setSelectedId(it.id); setLaneHint(null); setSnippet(""); }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                  selectedId === it.id ? "border-violet-500 bg-violet-500/10"
                    : dark ? "border-neutral-800 hover:bg-neutral-900" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate", dark ? "text-neutral-200" : "text-slate-800")}>#{it.id} {it.subject}</span>
                  <span className={cn("block truncate text-[11px]", muted)}>{it.source}{it.ext_ref ? ` · ${it.ext_ref}` : ""}{it.linked_story_id ? ` · story #${it.linked_story_id}` : ""}</span>
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
                  <h3 className={cn("text-base font-bold", dark ? "text-white" : "text-slate-900")}>#{selected.id} {selected.subject}</h3>
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
                <div className="flex gap-2">
                  <Button onClick={() => classify.mutate(selected.id, { onSuccess: () => toast.success("Triage complete."), onError: (e) => toast.error(errMsg(e)) })} disabled={busy}>
                    {classify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Classify (Triage)
                  </Button>
                  {classify.isPending && <CancelButton onCancel={() => classify.cancel()} />}
                </div>
              ) : null}

              {selected.ai_rationale?.classify ? (
                <div className={cn("rounded-lg border p-3 text-sm", cardBorder)}>
                  <span className="font-semibold">{selected.classification === "change_request" ? "Path A — Change Request" : "Path B — Bug"}:</span>{" "}
                  {selected.ai_rationale.classify}
                </div>
              ) : null}

              {/* Path A */}
              {selected.classification === "change_request" ? (
                <Callout>
                  Routed to discovery — a change request never gets patched directly.{" "}
                  <button className="font-semibold text-violet-500 hover:underline" onClick={() => router.push("/phase1")}>
                    Open in Phase 1 <ArrowRight className="inline h-3 w-3" />
                  </button>
                </Callout>
              ) : null}

              {/* Path B: diagnose */}
              {selected.classification === "bug" && !selected.diagnosis_md ? (
                <div className="space-y-2">
                  <p className={cn("text-xs", muted)}>Narrow diagnosis (Context Isolation): paste ONLY the implicated code snippet.</p>
                  <Textarea placeholder="Isolated code snippet" rows={4} value={snippet} onChange={(e) => setSnippet(e.target.value)} />
                  <div className="flex gap-2">
                    <Button onClick={() => diagnose.mutate({ itemId: selected.id, codeSnippet: snippet }, { onSuccess: () => toast.success("Diagnosis ready."), onError: (e) => toast.error(errMsg(e)) })} disabled={busy}>
                      {diagnose.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Diagnose
                    </Button>
                    {diagnose.isPending && <CancelButton onCancel={() => diagnose.cancel()} />}
                  </div>
                </div>
              ) : null}

              {selected.diagnosis_md ? (
                <div className={cn("whitespace-pre-wrap rounded-lg border p-3 text-xs", cardBorder, dark ? "bg-neutral-950 text-neutral-300" : "bg-slate-50 text-slate-700")}>
                  {selected.diagnosis_md}
                </div>
              ) : null}

              {/* F2: fix brief */}
              {selected.status === "diagnosed" ? (
                <div className="flex gap-2">
                  <Button onClick={() => fixBrief.mutate(selected.id, { onSuccess: () => toast.success("Fix-Bolt brief generated."), onError: (e) => toast.error(errMsg(e)) })} disabled={busy}>
                    {fixBrief.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generate Fix-Bolt Brief
                  </Button>
                  {fixBrief.isPending && <CancelButton onCancel={() => fixBrief.cancel()} />}
                </div>
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
                  {!laneHint ? (
                    <button className="text-xs font-semibold text-violet-500 hover:underline"
                      onClick={async () => { try { setLaneHint(await suggestLane(context, selected.id)); } catch (e) { toast.error(errMsg(e)); } }}>
                      Suggest lane (AI)
                    </button>
                  ) : (
                    <p className={cn("text-xs", muted)}>AI suggests <b>{laneHint.lane}</b>: {laneHint.rationale}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => route.mutate({ itemId: selected.id, lane: "fast" }, { onSuccess: () => toast.success("Fast Lane — deploy record"), onError: (e) => toast.error(errMsg(e)) })} disabled={route.isPending}>
                      <Zap className="h-4 w-4" /> Fast Lane
                    </Button>
                    <Button onClick={() => route.mutate({ itemId: selected.id, lane: "secure" }, { onSuccess: () => toast.success("Secure Lane — QA Regression Bypass"), onError: (e) => toast.error(errMsg(e)) })} disabled={route.isPending}>
                      <ShieldCheck className="h-4 w-4" /> Secure Lane
                    </Button>
                  </div>
                  {selected.lane ? <p className={cn("text-xs", muted)}>Routed: <b>{selected.lane}</b> lane.</p> : null}
                </div>
              ) : null}

              {/* resolve (Fix Log) */}
              {selected.status !== "resolved" && selected.classification === "bug" ? (
                <Button variant="secondary" onClick={() => resolve.mutate({ itemId: selected.id }, { onSuccess: () => toast.success("Resolved — fix logged"), onError: (e) => toast.error(errMsg(e)) })} disabled={resolve.isPending}>
                  Resolve (record fix)
                </Button>
              ) : null}
              {selected.status === "resolved" ? <Callout>Resolved — fix recorded in fix-log.md.</Callout> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
