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
import { toast } from "sonner";

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
    onError: () => toast.error("Failed to suggest epics. Check your connection and try again."),
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

export function usePushPhase1Stories() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Phase1PushStoriesRequest) => pushPhase1Stories(context!, body),
    onError: () => toast.error("Failed to push stories to Taiga. Check your connection and try again."),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
    },
  });
}
