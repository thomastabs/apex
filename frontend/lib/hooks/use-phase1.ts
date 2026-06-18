"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeRequirementGaps,
  compileGherkin,
  generateConstraints,
  generateNlStories,
  listPhase1Epics,
  pushPhase1Stories,
  suggestPhase1Epics,
  type ExistingEpicInput,
} from "@/lib/api/phase1";
import { refreshStoryIndex } from "@/lib/api/phase2";
import type { Phase1GenerateNlStoriesRequest, Phase1PushStoriesRequest } from "@/lib/api/types";
import { useApiContext } from "@/lib/stores/session-store";
import { toast } from "sonner";

export function usePhase1Epics() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase1", "epics", context?.projectId],
    queryFn: () => listPhase1Epics(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useSuggestPhase1Epics() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (hint: string) => suggestPhase1Epics(context!, hint),
    onError: () => toast.error("Failed to suggest epics. Check your connection and try again."),
  });
}

export function useAnalyzeGaps() {
  const context = useApiContext();

  return useMutation({
    mutationFn: ({ existingEpics, hint }: { existingEpics: ExistingEpicInput[]; hint: string }) =>
      analyzeRequirementGaps(context!, existingEpics, hint),
    onError: () => toast.error("Gap analysis failed. The AI may be busy — try again shortly."),
  });
}

export function useGenerateNlStories() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (body: Phase1GenerateNlStoriesRequest) => generateNlStories(context!, body),
    onError: () => toast.error("Story generation failed. The AI may be busy — try again shortly."),
  });
}

export function useCompileGherkin() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (nlDraft: string) => compileGherkin(context!, nlDraft),
    onError: () => toast.error("Gherkin compilation failed. The AI may be busy — try again shortly."),
  });
}

export function useGenerateConstraints() {
  const context = useApiContext();

  return useMutation({
    mutationFn: () => generateConstraints(context!),
    onError: () => toast.error("Constraint generation failed. The AI may be busy — try again shortly."),
  });
}

export function usePushPhase1Stories() {
  const context = useApiContext();
  const contextRef = useRef(context);
  contextRef.current = context;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Phase1PushStoriesRequest) => pushPhase1Stories(context!, body),
    onError: () => toast.error("Failed to push stories. Check your connection and try again."),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
      // story-index-stats is keyed by projectId, so the previous bare key with
      // exact:true matched nothing — include the id (audit M6).
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId], exact: true });
      if (contextRef.current) void refreshStoryIndex(contextRef.current);
      if (data.push_failures && data.push_failures.length > 0) {
        const names = data.push_failures.map((f) => f.title).join(", ");
        toast.warning(`${data.push_failures.length} story/stories failed to push: ${names}. Others were pushed successfully.`);
      }
    },
  });
}
