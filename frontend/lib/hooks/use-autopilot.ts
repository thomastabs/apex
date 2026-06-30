"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAutopilotStatus,
  pauseAutopilot,
  resumeAutopilot,
  startAutopilot,
  steerAutopilot,
  stopAutopilot,
  takeOverAutopilot,
} from "@/lib/api/autopilot";
import type { AutopilotStartRequest, AutopilotState } from "@/lib/api/autopilot";
import { useApiContext } from "@/lib/stores/session-store";
import { toast } from "sonner";

const POLL_INTERVAL = 1500;

const TERMINAL_STATES: AutopilotState[] = ["done", "stopped", "error"];

export function useStartAutopilot() {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AutopilotStartRequest) => startAutopilot(ctx!, body),
    onError: (err: Error) => toast.error(`Failed to start autopilot: ${err.message}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot"] }),
  });
}

export function useAutopilotStatus(jobId: string | null) {
  const ctx = useApiContext();
  return useQuery({
    queryKey: ["autopilot", jobId],
    queryFn: () => getAutopilotStatus(ctx!, jobId!),
    enabled: Boolean(ctx && jobId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (!state || TERMINAL_STATES.includes(state)) return false;
      return POLL_INTERVAL;
    },
    staleTime: 0,
  });
}

export function usePauseAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pauseAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: (err: Error) => toast.error(`Pause failed: ${err.message}`),
  });
}

export function useResumeAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resumeAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: (err: Error) => toast.error(`Resume failed: ${err.message}`),
  });
}

export function useStopAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => stopAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: (err: Error) => toast.error(`Stop failed: ${err.message}`),
  });
}

export function useTakeOverAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => takeOverAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: (err: Error) => toast.error(`Take-over failed: ${err.message}`),
  });
}

export function useSteerAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => steerAutopilot(ctx!, jobId!, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: (err: Error) => toast.error(`Steer failed: ${err.message}`),
  });
}
