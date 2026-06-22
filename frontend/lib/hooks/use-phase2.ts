"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crossCheckEndpoints,
  generateDesignSection,
  generateDiagram,
  generateScreenFlow,
  getDesign,
  getTechStackStatus,
  loadDiagram,
  loadScreenFlow,
  lockDesign,
  lockTechStack,
  proposeTechStack,
  refreshStoryIndex,
  saveDiagramPositions,
  saveScreenFlowPositions,
} from "@/lib/api/phase2";
import type {
  DesignSectionKey,
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

export const DESIGN_SECTION_ORDER: DesignSectionKey[] = ["ux_brief", "endpoints", "data_model"];

export type DesignSectionCallbacks = {
  onSection: (section: DesignSectionKey, content: string, storyIds: number[]) => void;
  onDone: () => void;
};

export function useCrossCheckEndpoints() {
  const context = useApiContext();
  return useCancellableMutation(
    (uxBrief: string, signal) => crossCheckEndpoints(context!, uxBrief, signal),
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
    async (callbacks: DesignSectionCallbacks) => {
      if (!context) return;
      abortRef.current = new AbortController();
      setIsPending(true);
      setError(null);
      const prior: Record<string, string> = {};
      try {
        for (const section of DESIGN_SECTION_ORDER) {
          setCurrentSection(section);
          const result = await generateDesignSection(
            context, section, prior, abortRef.current.signal,
          );
          prior[section] = result.content;
          callbacks.onSection(section, result.content, result.story_ids);
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
    ) => {
      if (!context) return;
      abortRef.current = new AbortController();
      setIsPending(true);
      setError(null);
      setCurrentSection(targetSection);
      try {
        const result = await generateDesignSection(
          context, targetSection, priorSections, abortRef.current.signal,
        );
        callbacks.onSection(targetSection, result.content, result.story_ids);
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
