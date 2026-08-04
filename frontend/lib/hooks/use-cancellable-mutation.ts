"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/use-translation";

export type CancellableMutationResult<TData, TVars> = UseMutationResult<
  TData,
  Error,
  TVars
> & {
  /** Abort the in-flight AI request and return the UI to idle. */
  cancel: () => void;
};

/** How long a generation runs before we tell the user it is still alive. AI
 *  calls here have 60s-300s deadlines, so silence for minutes is normal and
 *  indistinguishable from a hang without this. */
const LONG_OP_MS = 8_000;
const STILL_WORKING_MS = 45_000;

/**
 * useMutation wrapper that makes an AI call cancellable from the client.
 *
 * Owns a fresh AbortController per call and passes its signal into the
 * mutationFn (which forwards it to apiRequest → fetch). `cancel()` aborts the
 * request, resets the mutation so `isPending` flips to false instantly, and
 * shows the same "Generation cancelled" toast Phase 2 uses.
 *
 * Only a *deliberate* cancel is swallowed. A client-side deadline also aborts
 * the fetch, but apiRequest converts that into an ApiTimeoutError, which must
 * reach the error handlers - swallowing it (as this hook used to, by matching
 * on the AbortError name) meant a generation that timed out after five minutes
 * produced no feedback whatsoever.
 *
 * Semantics match Phase 2's hand-rolled cancel: the backend LLM call keeps
 * running and its result is discarded — there are no backend changes.
 */
export function useCancellableMutation<TVars, TData>(
  mutationFn: (vars: TVars, signal: AbortSignal) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVars>, "mutationFn">,
): CancellableMutationResult<TData, TVars> {
  const t = useT();
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const loadingToastRef = useRef<string | number | null>(null);

  const dismissLoading = useCallback(() => {
    if (loadingToastRef.current !== null) {
      toast.dismiss(loadingToastRef.current);
      loadingToastRef.current = null;
    }
  }, []);

  const mutation = useMutation<TData, Error, TVars>({
    ...options,
    mutationFn: (vars) => {
      cancelledRef.current = false;
      abortRef.current = new AbortController();
      return mutationFn(vars, abortRef.current.signal);
    },
    onError: (...args) => {
      // Swallow deliberate cancels only - no error toast, no caller onError.
      // Everything else (including timeouts) must propagate.
      if (cancelledRef.current) return;
      options?.onError?.(...args);
    },
  });

  const { isPending } = mutation;

  useEffect(() => {
    if (!isPending) {
      dismissLoading();
      return;
    }
    const showLoading = globalThis.setTimeout(() => {
      loadingToastRef.current = toast.loading(t("errors.longOp.working"), { duration: Infinity });
    }, LONG_OP_MS);
    const escalate = globalThis.setTimeout(() => {
      if (loadingToastRef.current === null) return;
      toast.loading(t("errors.longOp.working"), {
        id: loadingToastRef.current,
        description: t("errors.longOp.stillWorking"),
        duration: Infinity,
      });
    }, STILL_WORKING_MS);
    return () => {
      globalThis.clearTimeout(showLoading);
      globalThis.clearTimeout(escalate);
    };
  }, [isPending, t, dismissLoading]);

  // A `duration: Infinity` toast would otherwise outlive the component that
  // owns it (switching phase tabs mid-generation).
  useEffect(() => dismissLoading, [dismissLoading]);

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    cancelledRef.current = true;
    abortRef.current.abort();
    abortRef.current = null;
    mutation.reset();
    dismissLoading();
    toast.info(t("errors.cancelled"));
  }, [mutation, t, dismissLoading]);

  return { ...mutation, cancel };
}
