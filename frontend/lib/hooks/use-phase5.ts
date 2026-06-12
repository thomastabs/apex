"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateDeployPack,
  generateInfraDelta,
  getDeployPack,
  getEligibleStories,
  getInfraDelta,
  getStoryContext,
  passDeploymentGate,
  reviseDeployPack,
  saveDeployPack,
  saveInfraDelta,
} from "@/lib/api/phase5";
import { useApiContext } from "@/lib/stores/session-store";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { toast } from "sonner";
import type { InfraDelta } from "@/lib/api/types";

export function useEligibleStories() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase5", "eligible-stories", context?.projectId],
    queryFn: () => getEligibleStories(context!),
    enabled: Boolean(context),
  });
}

export function useStoryContext(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase5", "story-context", context?.projectId, storyId],
    queryFn: () => getStoryContext(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });
}

/** Loads a previously saved infra delta into the draft store (refresh-resume). */
export function useLoadInfraDelta(storyId: number | null, enabled: boolean) {
  const context = useApiContext();
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  return useQuery({
    queryKey: ["phase5", "infra-delta", context?.projectId, storyId],
    queryFn: async () => {
      const res = await getInfraDelta(context!, storyId!);
      setInfraDelta(res.delta, true);
      return res;
    },
    enabled: Boolean(context) && storyId !== null && enabled,
    retry: false, // 422 when no delta saved yet — expected, not an error to retry
  });
}

export function useGenerateInfraDelta() {
  const context = useApiContext();
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  return useMutation({
    mutationFn: (storyId: number) => generateInfraDelta(context!, storyId),
    onSuccess: (data) => setInfraDelta(data.delta, false),
    onError: (err: Error) => toast.error(`Infra delta check failed: ${err.message}`),
  });
}

export function useSaveInfraDelta() {
  const context = useApiContext();
  const qc = useQueryClient();
  const setDeltaSaved = usePhase5Store((s) => s.setDeltaSaved);
  return useMutation({
    mutationFn: ({ storyId, delta }: { storyId: number; delta: InfraDelta }) =>
      saveInfraDelta(context!, storyId, delta),
    onSuccess: (_, { storyId }) => {
      toast.success("Infra delta saved.");
      setDeltaSaved(true);
      void qc.invalidateQueries({ queryKey: ["phase5", "infra-delta", context?.projectId, storyId] });
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories"] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });
}

/** Loads a previously saved deploy pack into the draft store (refresh-resume). */
export function useLoadDeployPack(storyId: number | null, enabled: boolean) {
  const context = useApiContext();
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  return useQuery({
    queryKey: ["phase5", "deploy-pack", context?.projectId, storyId],
    queryFn: async () => {
      const res = await getDeployPack(context!, storyId!);
      if (res.deploy_pack_md) setDeployPackMd(res.deploy_pack_md, true);
      return res;
    },
    enabled: Boolean(context) && storyId !== null && enabled,
  });
}

export function useGenerateDeployPack() {
  const context = useApiContext();
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  return useMutation({
    mutationFn: (storyId: number) => generateDeployPack(context!, storyId),
    onSuccess: (data) => setDeployPackMd(data.deploy_pack_md, false),
    onError: (err: Error) => toast.error(`Deploy pack generation failed: ${err.message}`),
  });
}

export function useSaveDeployPack() {
  const context = useApiContext();
  const qc = useQueryClient();
  const setPackSaved = usePhase5Store((s) => s.setPackSaved);
  return useMutation({
    mutationFn: ({ storyId, deployPackMd }: { storyId: number; deployPackMd: string }) =>
      saveDeployPack(context!, storyId, deployPackMd),
    onSuccess: (_, { storyId }) => {
      toast.success("Deploy pack saved.");
      setPackSaved(true);
      void qc.invalidateQueries({ queryKey: ["phase5", "deploy-pack", context?.projectId, storyId] });
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories"] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });
}

export function useReviseDeployPack() {
  const context = useApiContext();
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  return useMutation({
    mutationFn: ({ storyId, deployPackMd, feedback }: {
      storyId: number;
      deployPackMd: string;
      feedback: string;
    }) => reviseDeployPack(context!, storyId, deployPackMd, feedback),
    onSuccess: (data) => {
      setDeployPackMd(data.deploy_pack_md, false);
      toast.success("Deploy pack revised — review and save it again.");
    },
    onError: (err: Error) => toast.error(`Revision failed: ${err.message}`),
  });
}

export function usePassDeploymentGate() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, techLeadApproved, devopsApproved, notes }: {
      storyId: number;
      techLeadApproved: boolean;
      devopsApproved: boolean;
      notes?: string;
    }) => passDeploymentGate(context!, storyId, { techLeadApproved, devopsApproved, notes }),
    onSuccess: () => {
      toast.success("Deployment Gate passed — story deployed.");
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories"] });
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
    onError: (err: Error) => toast.error(`Gate failed: ${err.message}`),
  });
}
