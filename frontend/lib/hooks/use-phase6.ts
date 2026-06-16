"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyMaintenanceItem,
  createMaintenanceItem,
  diagnoseMaintenanceItem,
  fixBriefMaintenanceItem,
  getConformanceEligibleStories,
  getConformanceReport,
  listMaintenanceItems,
  resolveMaintenanceItem,
  routeMaintenanceItem,
  verifyConformance,
} from "@/lib/api/phase6";
import { useApiContext } from "@/lib/stores/session-store";
import type { ConformanceReport, MaintenanceItem } from "@/lib/api/types";

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

export function useVerifyConformance() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, ai = true }: { storyId: number; ai?: boolean }) =>
      verifyConformance(context!, storyId, ai),
    onSuccess: (report: ConformanceReport) => {
      qc.setQueryData(
        ["phase6", "conformance", context?.projectId, report.story_id],
        report,
      );
      qc.invalidateQueries({ queryKey: ["phase6", "eligible-stories", context?.projectId] });
    },
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

function useItemMutation(fn: (ctx: NonNullable<ReturnType<typeof useApiContext>>, id: number) => Promise<MaintenanceItem>) {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => fn(context!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] }),
  });
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
  return useItemMutation((ctx, id) => classifyMaintenanceItem(ctx, id));
}

export function useDiagnoseItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, codeSnippet }: { itemId: number; codeSnippet: string }) =>
      diagnoseMaintenanceItem(context!, itemId, codeSnippet),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] }),
  });
}

export function useFixBriefItem() {
  return useItemMutation((ctx, id) => fixBriefMaintenanceItem(ctx, id));
}

export function useRouteItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, lane }: { itemId: number; lane: "fast" | "secure" }) =>
      routeMaintenanceItem(context!, itemId, lane),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] });
      // A routed fix re-routes the linked story — refresh board + stats.
      qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
      qc.invalidateQueries({ queryKey: ["workspace", "board", context?.projectId] });
    },
  });
}

export function useResolveItem() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, rootCause, resolutionSummary }: { itemId: number; rootCause?: string; resolutionSummary?: string }) =>
      resolveMaintenanceItem(context!, itemId, rootCause, resolutionSummary),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phase6", "maintenance", context?.projectId] }),
  });
}
