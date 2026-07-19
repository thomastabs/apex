"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildScreenFlowFromFigma,
  crossCheckEndpoints,
  generateDesignDelta,
  generateDesignSection,
  generateDesignSystem,
  generateDesignSystemScreen,
  saveDesignSystem,
  generateDiagram,
  generateScreenFlow,
  getDesign,
  getDesignDeltaStatus,
  getTechStackStatus,
  loadDesignSystem,
  loadDiagram,
  loadScreenFlow,
  lockDesign,
  lockTechStack,
  persistDesignDelta,
  proposeTechStack,
  refreshStoryIndex,
  saveDiagramPositions,
  saveScreenFlowPositions,
  type PersistDesignDeltaRequest,
} from "@/lib/api/phase2";
import type {
  AssumptionEntry,
  DesignSectionKey,
  DesignSystemResponse,
  DiagramNode,
  DiagramResponse,
  LockDesignRequest,
  LockTechStackRequest,
  ProposeTechStackRequest,
  ScreenFlowNode,
  ScreenFlowResponse,
} from "@/lib/api/types";
import { useApiContext } from "@/lib/stores/session-store";
import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";
import { toast } from "sonner";

export function useTechStackStatus() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase2", "tech-stack-status", context?.projectId],
    queryFn: () => getTechStackStatus(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useDesignBundle() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase2", "design-bundle", context?.projectId],
    queryFn: () => getDesign(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useProposeTechStack() {
  const context = useApiContext();

  return useCancellableMutation(
    (body: ProposeTechStackRequest, signal) => proposeTechStack(context!, body, signal),
    { onError: () => toast.error("Tech stack proposal failed. The AI may be busy — try again shortly.") },
  );
}

export function useLockTechStack() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockTechStackRequest) => lockTechStack(context!, body),
    onError: () => toast.error("Failed to lock tech stack."),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useDesignDeltaStatus() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase2", "design-delta-status", context?.projectId],
    queryFn: () => getDesignDeltaStatus(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useGenerateDesignDelta() {
  const context = useApiContext();
  return useCancellableMutation(
    ({ storyIds = [], instructions = "", extraContextFiles = [] }: { storyIds?: number[]; instructions?: string; extraContextFiles?: string[] }, signal) =>
      generateDesignDelta(context!, storyIds, instructions, signal, extraContextFiles),
    { onError: (e: Error) => toast.error(`Design delta generation failed: ${e.message}`) },
  );
}

export function usePersistDesignDelta() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PersistDesignDeltaRequest) => persistDesignDelta(context!, body),
    onError: (e: Error) => toast.error(`Failed to append design delta: ${e.message}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "design-delta-status", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "design-bundle", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export const DESIGN_SECTION_ORDER: DesignSectionKey[] = ["ux_brief", "endpoints", "data_model", "runtime"];

export type DesignSectionCallbacks = {
  onSection: (
    section: DesignSectionKey, content: string, storyIds: number[], assumptions: AssumptionEntry[],
  ) => void;
  onDone: () => void;
};

export function useCrossCheckEndpoints() {
  const context = useApiContext();
  return useCancellableMutation(
    ({ uxBrief, altModel = "" }: { uxBrief: string; altModel?: string }, signal) =>
      crossCheckEndpoints(context!, uxBrief, altModel, signal),
    { onError: (e: Error) => toast.error(`Cross-check failed: ${e.message}`) },
  );
}

export function useGenerateDesignSections() {
  const context = useApiContext();
  const [isPending, setIsPending] = useState(false);
  const [currentSection, setCurrentSection] = useState<DesignSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (callbacks: DesignSectionCallbacks, instructions = "", extraContextFiles: string[] = []) => {
      if (!context) return;
      abortRef.current = new AbortController();
      setIsPending(true);
      setError(null);
      const prior: Record<string, string> = {};
      try {
        for (const section of DESIGN_SECTION_ORDER) {
          setCurrentSection(section);
          const result = await generateDesignSection(
            context, section, prior, instructions, abortRef.current.signal, extraContextFiles,
          );
          prior[section] = result.content;
          callbacks.onSection(section, result.content, result.story_ids, result.assumptions);
        }
        callbacks.onDone();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Generation failed";
        setError(msg);
        toast.error(`Design generation failed: ${msg}`);
      } finally {
        setIsPending(false);
        setCurrentSection(null);
        abortRef.current = null;
      }
    },
    [context],
  );

  const generateSection = useCallback(
    async (
      targetSection: DesignSectionKey,
      priorSections: Record<string, string>,
      callbacks: DesignSectionCallbacks,
      instructions = "",
      extraContextFiles: string[] = [],
    ) => {
      if (!context) return;
      abortRef.current = new AbortController();
      setIsPending(true);
      setError(null);
      setCurrentSection(targetSection);
      try {
        const result = await generateDesignSection(
          context, targetSection, priorSections, instructions, abortRef.current.signal, extraContextFiles,
        );
        callbacks.onSection(targetSection, result.content, result.story_ids, result.assumptions);
        callbacks.onDone();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Generation failed";
        setError(msg);
        toast.error(`Generation failed: ${msg}`);
      } finally {
        setIsPending(false);
        setCurrentSection(null);
        abortRef.current = null;
      }
    },
    [context],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    toast.info("Generation cancelled");
  }, []);

  return { generate, generateSection, isPending, currentSection, error, cancel };
}

export function useLockDesign() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockDesignRequest) => lockDesign(context!, body),
    onError: () => toast.error("Failed to lock design."),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useLoadDiagram() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase2", "diagram", context?.projectId],
    queryFn: () => loadDiagram(context!),
    enabled: Boolean(context),
    staleTime: Infinity,
  });
}

export function useGenerateDiagram() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useCancellableMutation(
    (data_model_md: string, signal) => generateDiagram(context!, data_model_md, signal),
    {
      onSuccess: (data: DiagramResponse) => {
        queryClient.setQueryData(["phase2", "diagram", context?.projectId], data);
      },
      onError: () => toast.error("Failed to generate diagram. Try again."),
    },
  );
}

export function useSaveDiagramPositions() {
  const context = useApiContext();
  return useMutation({
    mutationFn: (nodes: DiagramNode[]) => saveDiagramPositions(context!, nodes),
  });
}

export function useLoadScreenFlow() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase2", "screen-flow", context?.projectId],
    queryFn: () => loadScreenFlow(context!),
    enabled: Boolean(context),
    staleTime: Infinity,
  });
}

export function useGenerateScreenFlow() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useCancellableMutation(
    (ux_brief_md: string, signal) => generateScreenFlow(context!, ux_brief_md, signal),
    {
      onSuccess: (data: ScreenFlowResponse) => {
        queryClient.setQueryData(["phase2", "screen-flow", context?.projectId], data);
      },
      onError: () => toast.error("Failed to generate screen flow. Try again."),
    },
  );
}

export function useSaveScreenFlowPositions() {
  const context = useApiContext();
  return useMutation({
    mutationFn: (nodes: ScreenFlowNode[]) => saveScreenFlowPositions(context!, nodes),
  });
}

export function useBuildScreenFlowFromFigma() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { frames: Array<{ node_id: string; name: string; page?: string }>; flows: Array<{ from_name: string; to_name: string }> }) =>
      buildScreenFlowFromFigma(context!, body),
    onSuccess: (data: ScreenFlowResponse) => {
      queryClient.setQueryData(["phase2", "screen-flow", context?.projectId], data);
    },
    onError: () => toast.error("Failed to build screen flow from Figma. Try again."),
  });
}

export function useLoadDesignSystem() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase2", "design-system", context?.projectId],
    queryFn: () => loadDesignSystem(context!),
    enabled: Boolean(context),
    staleTime: Infinity,
  });
}

export function useGenerateDesignSystem() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useCancellableMutation(
    ({ ux_brief_md, instructions = "" }: { ux_brief_md: string; instructions?: string }, signal) =>
      generateDesignSystem(context!, ux_brief_md, instructions, signal),
    {
      onSuccess: (data: DesignSystemResponse) => {
        queryClient.setQueryData(["phase2", "design-system", context?.projectId], data);
      },
      onError: () => toast.error("Failed to generate design system. Try again."),
    },
  );
}

export function useSaveDesignSystem() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (designSystem: DesignSystemResponse) => saveDesignSystem(context!, designSystem),
    onSuccess: (data: DesignSystemResponse) => {
      queryClient.setQueryData(["phase2", "design-system", context?.projectId], data);
    },
    onError: () => toast.error("Failed to save design system. Try again."),
  });
}

export function useGenerateDesignSystemScreen() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useCancellableMutation(
    (body: { ux_brief_md: string; screen_id?: string; instructions?: string }, signal) =>
      generateDesignSystemScreen(context!, body, signal),
    {
      onSuccess: (data: DesignSystemResponse) => {
        queryClient.setQueryData(["phase2", "design-system", context?.projectId], data);
      },
      onError: () => toast.error("Failed to generate screen. Try again."),
    },
  );
}

export function useRefreshStoryIndex() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshStoryIndex(context!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}
