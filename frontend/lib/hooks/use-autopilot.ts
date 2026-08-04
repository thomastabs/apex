"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearPersistedAutopilot,
  getAutopilotStatus,
  getPersistedAutopilot,
  pauseAutopilot,
  resumeAutopilot,
  resumeInterruptedAutopilot,
  startAutopilot,
  steerAutopilot,
  stopAutopilot,
  takeOverAutopilot,
} from "@/lib/api/autopilot";
import type { AutopilotStartRequest, AutopilotState, AutopilotStatus } from "@/lib/api/autopilot";
import { contextHeaders, getApiBaseUrl } from "@/lib/api/client";
import { useApiContext } from "@/lib/stores/session-store";

const POLL_INTERVAL = 1500;

const TERMINAL_STATES: AutopilotState[] = ["done", "stopped", "error"];

export function useStartAutopilot() {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AutopilotStartRequest) => startAutopilot(ctx!, body),
    meta: { errorLabel: "op.startAutopilot" },
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

/**
 * Stream live job status (NDJSON over fetch) into the same React Query cache the
 * poller uses, so the UI updates the instant the pipeline emits an event instead of
 * on the 1.5s poll tick. EventSource can't send our Bearer header, so this uses a
 * streaming fetch + ReadableStream. On any error/disconnect it silently stops and
 * the poller (useAutopilotStatus) keeps the view live as a fallback.
 */
export function useAutopilotStream(jobId: string | null, enabled: boolean) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  useEffect(() => {
    if (!ctx || !jobId || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/autopilot/${jobId}/stream`, {
          headers: { Accept: "application/x-ndjson", ...contextHeaders(ctx) },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            let obj: unknown;
            try { obj = JSON.parse(t); } catch { continue; }
            if (obj && typeof obj === "object" && (obj as { type?: string }).type === "ping") continue;
            qc.setQueryData(["autopilot", jobId], obj as AutopilotStatus);
          }
        }
      } catch {
        /* aborted or network error — the poller keeps the view live */
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [ctx, jobId, enabled, qc]);
}

/** Reattach discovery: the active project's persisted job (live, interrupted, or none).
 *  Used to recover the run view after a refresh or backend restart. */
export function usePersistedAutopilot(enabled: boolean) {
  const ctx = useApiContext();
  return useQuery({
    queryKey: ["autopilot", "persisted", ctx?.projectId],
    queryFn: async () => {
      try {
        return await getPersistedAutopilot(ctx!);
      } catch (err) {
        if ((err as { status?: number })?.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(ctx && enabled),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "running" || state === "paused" ? POLL_INTERVAL : false;
    },
    staleTime: 0,
  });
}

export function useResumeInterruptedAutopilot() {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resumeInterruptedAutopilot(ctx!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot"] }),
    meta: { errorLabel: "op.resumeAutopilot" },
  });
}

export function useClearPersistedAutopilot() {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    meta: { errorLabel: "op.clearAutopilot" },
    mutationFn: () => clearPersistedAutopilot(ctx!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot"] }),
  });
}

export function usePauseAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pauseAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    meta: { errorLabel: "op.pauseAutopilot" },
  });
}

export function useResumeAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resumeAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    meta: { errorLabel: "op.resumeAutopilot" },
  });
}

export function useStopAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => stopAutopilot(ctx!, jobId!),
    onMutate: () => {
      // Freeze the UI immediately — disables the stream and polling before the
      // server round-trip completes (otherwise the in-flight stream keeps pushing
      // events for up to ~10s while a long AI call finishes).
      qc.setQueryData<AutopilotStatus>(["autopilot", jobId], (old) =>
        old ? { ...old, state: "stopped" } : old,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    onError: () => {
      // Roll back the optimistic "stopping" state; the toast comes from the
      // global mutation net.
      void qc.invalidateQueries({ queryKey: ["autopilot", jobId] });
    },
    meta: { errorLabel: "op.stopAutopilot" },
  });
}

export function useTakeOverAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => takeOverAutopilot(ctx!, jobId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    meta: { errorLabel: "op.takeOverAutopilot" },
  });
}

export function useSteerAutopilot(jobId: string | null) {
  const ctx = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => steerAutopilot(ctx!, jobId!, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot", jobId] }),
    meta: { errorLabel: "op.steerAutopilot" },
  });
}
