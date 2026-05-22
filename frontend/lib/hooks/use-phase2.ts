"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateDesignBundle,
  getTechStackStatus,
  lockDesign,
  lockTechStack,
  proposeTechStack,
  refreshStoryIndex,
} from "@/lib/api/phase2";
import type {
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

export function useGenerateDesignBundle() {
  const context = useApiContext();
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      abortRef.current = new AbortController();
      return generateDesignBundle(context!, abortRef.current.signal);
    },
    onError: (err) => {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Design bundle generation failed. The AI may be busy — try again shortly.");
    },
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    toast.info("Generation cancelled");
  }, []);

  return { ...mutation, cancel };
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
