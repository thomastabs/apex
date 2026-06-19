import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function freshClient() {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

beforeEach(() => vi.clearAllMocks());

describe("useCancellableMutation", () => {
  it("calls onSuccess on a normal run and threads a signal", async () => {
    const onSuccess = vi.fn();
    let received: AbortSignal | null = null;
    const fn = vi.fn((_vars: number, signal: AbortSignal) => {
      received = signal;
      return Promise.resolve("ok");
    });

    const qc = freshClient();
    const { result } = renderHook(() => useCancellableMutation(fn, { onSuccess }), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.mutate(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(received).toBeInstanceOf(AbortSignal);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("cancel aborts, flips isPending off, fires no error toast, and signals the call", async () => {
    const onError = vi.fn();
    let capturedSignal: AbortSignal | null = null;
    // Never resolves until aborted — simulates a long AI call.
    const fn = (_vars: number, signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        capturedSignal = signal;
        signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const qc = freshClient();
    const { result } = renderHook(() => useCancellableMutation(fn, { onError }), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.mutate(1));
    await waitFor(() => expect(result.current.isPending).toBe(true));

    act(() => result.current.cancel());

    expect(capturedSignal!.aborted).toBe(true);
    expect(toast.info).toHaveBeenCalledWith("Generation cancelled");
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(onError).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
