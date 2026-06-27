"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeRequirementGaps,
  compileGherkin,
  generateConstraints,
  crossCheckStories,
  generateNlStories,
  generateStoriesFromFigma,
  listPhase1Epics,
  pushPhase1Stories,
  suggestPhase1Epics,
  type ExistingEpicInput,
} from "@/lib/api/phase1";
import { refreshStoryIndex } from "@/lib/api/phase2";
import type { Phase1GenerateNlStoriesRequest, Phase1PushStoriesRequest } from "@/lib/api/types";
import { useApiContext } from "@/lib/stores/session-store";
import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";
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

  return useCancellableMutation(
    (hint: string, signal) => suggestPhase1Epics(context!, hint, signal),
    { onError: () => toast.error("Failed to suggest epics. Check your connection and try again.") },
  );
}

export function useAnalyzeGaps() {
  const context = useApiContext();

  return useCancellableMutation(
    ({ existingEpics, hint }: { existingEpics: ExistingEpicInput[]; hint: string }, signal) =>
      analyzeRequirementGaps(context!, existingEpics, hint, signal),
    { onError: () => toast.error("Gap analysis failed. The AI may be busy — try again shortly.") },
  );
}

export function useGenerateNlStories() {
  const context = useApiContext();

  return useCancellableMutation(
    (body: Phase1GenerateNlStoriesRequest, signal) => generateNlStories(context!, body, signal),
    { onError: () => toast.error("Story generation failed. The AI may be busy — try again shortly.") },
  );
}

export function useGenerateStoriesFromFigma() {
  const context = useApiContext();

  return useCancellableMutation(
    (
      body: { frames: Array<{ name: string; description?: string }>; flows: Array<{ from_name: string; to_name: string }>; instructions?: string },
      signal,
    ) => generateStoriesFromFigma(context!, body, signal),
    { onError: () => toast.error("Figma story generation failed. The AI may be busy — try again shortly.") },
  );
}

export function useCrossCheckStories() {
  const context = useApiContext();

  return useCancellableMutation(
    ({ altModel = "", ...body }: Phase1GenerateNlStoriesRequest & { altModel?: string }, signal) =>
      crossCheckStories(context!, body, altModel, signal),
    { onError: (e: Error) => toast.error(`Cross-check failed: ${e.message}`) },
  );
}

export function useCompileGherkin() {
  const context = useApiContext();

  return useCancellableMutation(
    (nlDraft: string, signal) => compileGherkin(context!, nlDraft, signal),
    { onError: () => toast.error("Gherkin compilation failed. The AI may be busy — try again shortly.") },
  );
}

export function useGenerateConstraints() {
  const context = useApiContext();

  return useCancellableMutation(
    (_: void, signal) => generateConstraints(context!, signal),
    { onError: () => toast.error("Constraint generation failed. The AI may be busy — try again shortly.") },
  );
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
