"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  compileGherkin,
  generateNlStories,
  listPhase1Epics,
  pushPhase1Stories,
  suggestPhase1Epics,
} from "@/lib/api/phase1";
import type { Phase1GenerateNlStoriesRequest, Phase1PushStoriesRequest } from "@/lib/api/types";
import { useApiContext } from "@/lib/stores/session-store";

export function usePhase1Epics() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase1", "epics", context?.projectId],
    queryFn: () => listPhase1Epics(context!),
    enabled: Boolean(context),
  });
}

export function useSuggestPhase1Epics() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (hint: string) => suggestPhase1Epics(context!, hint),
  });
}

export function useGenerateNlStories() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (body: Phase1GenerateNlStoriesRequest) => generateNlStories(context!, body),
  });
}

export function useCompileGherkin() {
  return useMutation({
    mutationFn: (nlDraft: string) => compileGherkin(nlDraft),
  });
}

export function usePushPhase1Stories() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Phase1PushStoriesRequest) => pushPhase1Stories(context!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
    },
  });
}
