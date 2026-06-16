"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConformanceEligibleStories,
  getConformanceReport,
  verifyConformance,
} from "@/lib/api/phase6";
import { useApiContext } from "@/lib/stores/session-store";
import type { ConformanceReport } from "@/lib/api/types";

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
