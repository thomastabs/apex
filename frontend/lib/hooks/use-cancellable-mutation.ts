"use client";

import { useCallback, useRef } from "react";
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

export type CancellableMutationResult<TData, TVars> = UseMutationResult<
  TData,
  Error,
  TVars
> & {
  /** Abort the in-flight AI request and return the UI to idle. */
  cancel: () => void;
};

/**
 * useMutation wrapper that makes an AI call cancellable from the client.
 *
 * Owns a fresh AbortController per call and passes its signal into the
 * mutationFn (which forwards it to apiRequest → fetch). `cancel()` aborts the
 * request, resets the mutation so `isPending` flips to false instantly, and
 * shows the same "Generation cancelled" toast Phase 2 uses. The abort
 * rejection is swallowed so a deliberate cancel never raises an error toast.
 *
 * Semantics match Phase 2's hand-rolled cancel: the backend LLM call keeps
 * running and its result is discarded — there are no backend changes.
 */
export function useCancellableMutation<TVars, TData>(
  mutationFn: (vars: TVars, signal: AbortSignal) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVars>, "mutationFn">,
): CancellableMutationResult<TData, TVars> {
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const mutation = useMutation<TData, Error, TVars>({
    ...options,
    mutationFn: (vars) => {
      cancelledRef.current = false;
      abortRef.current = new AbortController();
      return mutationFn(vars, abortRef.current.signal);
    },
    onError: (...args) => {
      const error = args[0];
      // Swallow deliberate cancels — no error toast, no caller onError.
      if (
        cancelledRef.current ||
        error?.name === "AbortError" ||
        /aborted/i.test(error?.message ?? "")
      ) {
        return;
      }
      options?.onError?.(...args);
    },
  });

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    cancelledRef.current = true;
    abortRef.current.abort();
    abortRef.current = null;
    mutation.reset();
    toast.info("Generation cancelled");
  }, [mutation]);

  return { ...mutation, cancel };
}
