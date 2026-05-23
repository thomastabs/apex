"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateDesignSection,
  getTechStackStatus,
  lockDesign,
  lockTechStack,
  proposeTechStack,
  refreshStoryIndex,
} from "@/lib/api/phase2";
import type {
  DesignSectionKey,
  LockDesignRequest,
  LockTechStackRequest,
  ProposeTechStackRequest,
} from "@/lib/api/types";
import { useApiContext } from "@/lib/stores/session-store";
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

export function useProposeTechStack() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (body: ProposeTechStackRequest) => proposeTechStack(context!, body),
    onError: () => toast.error("Tech stack proposal failed. The AI may be busy — try again shortly."),
  });
}

export function useLockTechStack() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockTechStackRequest) => lockTechStack(context!, body),
    onError: () => toast.error("Failed to lock tech stack."),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status"] });
    },
  });
}

export const DESIGN_SECTION_ORDER: DesignSectionKey[] = [
  "wireframes",
  "user_flow",
  "component_tree",
  "tech_spec",
];

export type DesignSectionCallbacks = {
  onSection: (section: DesignSectionKey, content: string, storyIds: number[]) => void;
  onDone: () => void;
};

export function useGenerateDesignSections() {
  const context = useApiContext();
  const [isPending, setIsPending] = useState(false);
  const [currentSection, setCurrentSection] = useState<DesignSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Generate all 4 sections sequentially.
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

  // Generate a single section with explicit prior sections (for per-step regeneration).
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
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
  });
}

export function useRefreshStoryIndex() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshStoryIndex(context!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
  });
}
