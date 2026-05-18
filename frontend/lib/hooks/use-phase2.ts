"use client";

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
  });
}

export function useLockTechStack() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockTechStackRequest) => lockTechStack(context!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "tech-stack-status"] });
    },
  });
}

export function useGenerateDesignBundle() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (body: GenerateDesignBundleRequest) => generateDesignBundle(context!, body),
  });
}

export function useLockEpicDesign() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LockEpicDesignRequest) => lockEpicDesign(context!, body),
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
