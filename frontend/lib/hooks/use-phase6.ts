"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  acknowledgeRegression,
  classifyMaintenanceItem,
  createMaintenanceItem,
  deleteMaintenanceItem,
  diagnoseMaintenanceItem,
  fixBriefMaintenanceItem,
  getConformanceEligibleStories,
  getConformanceReport,
  listMaintenanceItems,
  resolveMaintenanceItem,
  routeMaintenanceItem,
  scanRegressions,
  verifyConformance,
} from "@/lib/api/phase6";
import { useApiContext } from "@/lib/stores/session-store";
import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";
import { useT } from "@/lib/i18n/use-translation";
import { errMsg } from "@/lib/utils";
import type { ConformanceReport, MaintenanceItem, ScanReport } from "@/lib/api/types";

// Success/error toasts for these long-running AI mutations are set at the
// HOOK level (here) rather than passed to the call-site `.mutate(vars, opts)`
// call in the consuming component. TanStack Query only fires call-site
// mutate() options while the calling component still has listeners — if the
// user switches tabs (unmounting TraceabilityPanel/MaintenanceTriage) before
// an up-to-8-minute AI call resolves, a call-site toast is silently dropped.
// Hook-level onSuccess/onError (passed to useMutation's own options) run
// unconditionally from Mutation.execute() regardless of whether any component
// is still mounted to observe them.

export function useConformanceEligibleStories() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase6", "eligible-stories", context?.projectId],
    queryFn: () => getConformanceEligibleStories(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useConformanceReport(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase6", "conformance", context?.projectId, storyId],
    queryFn: () => getConformanceReport(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });
}

type VerifyConformanceVars = { storyId: number; ai?: boolean; extraFiles?: { path: string; content: string }[]; panel?: boolean; extraContextFiles?: string[] };

export function useVerifyConformance() {
  const context = useApiContext();
  const qc = useQueryClient();
  const t = useT();
  return useCancellableMutation(
    ({ storyId, ai = true, extraFiles = [], panel = false, extraContextFiles = [] }: VerifyConformanceVars, signal) =>
      extraContextFiles.length
        ? verifyConformance(context!, storyId, ai, extraFiles, signal, panel, extraContextFiles)
        : verifyConformance(context!, storyId, ai, extraFiles, signal, panel),
    {
      onSuccess: (report: ConformanceReport, variables) => {
        qc.setQueryData(
          ["phase6", "conformance", context?.projectId, report.story_id],
          report,
        );
        qc.invalidateQueries({ queryKey: ["phase6", "eligible-stories", context?.projectId] });
        if (variables.extraFiles?.length) {
          toast.success(t("phase6.toast.reverifiedWith", { path: variables.extraFiles[0].path }));
        } else if (variables.panel) {
          toast.success(t("phase6.toast.verifiedByPanel"));
        } else if (variables.ai ?? true) {
          toast.success(t("phase6.toast.verified"));
        } else {
          toast.success(t("phase6.toast.quickCheckComputed"));
        }
      },
      onError: (err) => toast.error(errMsg(err)),
    },
  );
}

export function useScanRegressions() {
  const context = useApiContext();
  const qc = useQueryClient();
  const t = useT();
  return useCancellableMutation(
    ({ panel = false, extraContextFiles = [] }: { panel?: boolean; extraContextFiles?: string[] }, signal) =>
      extraContextFiles.length
        ? scanRegressions(context!, panel, signal, extraContextFiles)
        : scanRegressions(context!, panel, signal),
    {
      onSuccess: (report: ScanReport) => {
        // Refresh per-story reports (each was re-verified) + board/analytics flags.
        qc.invalidateQueries({ queryKey: ["phase6", "conformance", context?.projectId] });
        qc.invalidateQueries({ queryKey: ["phase6", "eligible-stories", context?.projectId] });
        qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
        toast.success(
          report.regressed_ids.length > 0
            ? t(
                report.regressed_ids.length === 1
                  ? "phase6.toast.regressionsFoundOne"
                  : "phase6.toast.regressionsFoundOther",
                { n: report.regressed_ids.length },
              )
            : t("phase6.toast.noRegressions"),
        );
        return report;
      },
      onError: (err) => toast.error(errMsg(err)),
    },
  );
}

export function useAcknowledgeRegression() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => acknowledgeRegression(context!, storyId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] }),
  });
}

// ── Maintenance (F1 Triage + F2 Fix-Bolt routing) ──────────────────────────

export function useMaintenanceItems() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase6", "maintenance", context?.projectId],
    queryFn: () => listMaintenanceItems(context!),
    enabled: Boolean(context),
    staleTime: 15_000,
  });
}

type ItemMutationInput = number | { itemId: number; extraContextFiles?: string[] };

function normalizeItemMutationInput(input: ItemMutationInput) {
  return typeof input === "number" ? { itemId: input, extraContextFiles: [] } : { extraContextFiles: [], ...input };
}

function useItemMutation(
  fn: (ctx: NonNullable<ReturnType<typeof useApiContext>>, id: number, signal: AbortSignal, extraContextFiles?: string[]) => Promise<MaintenanceItem>,
  successMessage: string,
) {
  const context = useApiContext();
  const qc = useQueryClient();
  return useCancellableMutation(
    (input: ItemMutationInput, signal) => {
      const { itemId, extraContextFiles } = normalizeItemMutationInput(input);
      return extraContextFiles.length
        ? fn(context!, itemId, signal, extraContextFiles)
        : fn(context!, itemId, signal);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] });
        toast.success(successMessage);
      },
      onError: (err) => toast.error(errMsg(err)),
    },
  );
}

export function useCreateMaintenanceItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createMaintenanceItem>[1]) => createMaintenanceItem(context!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] }),
  });
}

export function useClassifyItem() {
  return useItemMutation(
    (ctx, id, signal, extraContextFiles) =>
      extraContextFiles?.length
        ? classifyMaintenanceItem(ctx, id, signal, extraContextFiles)
        : classifyMaintenanceItem(ctx, id, signal),
    "Triage complete.",
  );
}

export function useDeleteMaintenanceItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => deleteMaintenanceItem(context!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] }),
  });
}

export function useDiagnoseItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useCancellableMutation(
    ({ itemId, codeSnippet, extraContextFiles = [] }: { itemId: number; codeSnippet: string; extraContextFiles?: string[] }, signal) =>
      extraContextFiles.length
        ? diagnoseMaintenanceItem(context!, itemId, codeSnippet, signal, extraContextFiles)
        : diagnoseMaintenanceItem(context!, itemId, codeSnippet, signal),
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] });
        toast.success("Diagnosis ready.");
      },
      onError: (err) => toast.error(errMsg(err)),
    },
  );
}

export function useFixBriefItem() {
  return useItemMutation(
    (ctx, id, signal, extraContextFiles) =>
      extraContextFiles?.length
        ? fixBriefMaintenanceItem(ctx, id, signal, extraContextFiles)
        : fixBriefMaintenanceItem(ctx, id, signal),
    "Fix-Bolt brief generated.",
  );
}

export function useRouteItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, lane }: { itemId: number; lane: "fast" | "secure" }) =>
      routeMaintenanceItem(context!, itemId, lane),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] });
      // A routed fix re-routes the linked story — refresh board + stats.
      qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
      qc.invalidateQueries({ queryKey: ["workspace", "board", context?.projectId] });
      toast.success(variables.lane === "fast" ? "Fast Lane — deploy record" : "Secure Lane — QA Regression Bypass");
    },
    onError: (err) => toast.error(errMsg(err)),
  });
}

export function useResolveItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, rootCause, resolutionSummary }: { itemId: number; rootCause?: string; resolutionSummary?: string }) =>
      resolveMaintenanceItem(context!, itemId, rootCause, resolutionSummary),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] });
      toast.success("Resolved — fix logged");
    },
    onError: (err) => toast.error(errMsg(err)),
  });
}
