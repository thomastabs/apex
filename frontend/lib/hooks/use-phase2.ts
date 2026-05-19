"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateDesignBundle,
  getTechStackStatus,
  listEligiblePhase2Epics,
  lockEpicDesign,
  lockTechStack,
  proposeTechStack,
  refreshStoryIndex,
} from "@/lib/api/phase2";
import type {
  GenerateDesignBundleRequest,
  LockEpicDesignRequest,
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
  });
}

export function useEligiblePhase2Epics() {
  const context = useApiContext();

  return useQuery({
    queryKey: ["phase2", "eligible-epics", context?.projectId],
    queryFn: () => listEligiblePhase2Epics(context!),
    enabled: Boolean(context),
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
    mutationFn: (body: GenerateDesignBundleRequest) => {
      abortRef.current = new AbortController();
      return generateDesignBundle(context!, body, abortRef.current.signal);
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

export function useLockEpicDesign() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockEpicDesignRequest) => lockEpicDesign(context!, body),
    onError: () => toast.error("Failed to lock epic design."),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status"] });
    },
  });
}

export function useRefreshStoryIndex() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshStoryIndex(context!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
    },
  });
}
