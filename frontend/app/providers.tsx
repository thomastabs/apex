"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { notifyError } from "@/lib/error-toast";
import { useIdleLogout } from "@/lib/hooks/use-idle-logout";
import { useUiStore } from "@/lib/stores/ui-store";
import type { TranslationKey } from "@/lib/i18n/translations";
import { translate } from "@/lib/i18n/translate";

/**
 * Per-query / per-mutation error-reporting options, read by the global caches
 * below. React Query v5 removed per-query `onError`, so `meta` is the only way
 * a call site can influence how its failure is reported.
 *
 * The default is LOUD: anything that fails toasts. Silence is opt-in, so a
 * newly added query or mutation can never fail invisibly just because whoever
 * wrote it forgot an `onError` — which is exactly how the previous 48 silent
 * mutations and 32 silent queries accumulated.
 */
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: ApexMeta;
    mutationMeta: ApexMeta;
  }
}

export type ApexMeta = {
  /** Suppress the automatic toast — for genuinely optional/background calls. */
  toastSilent?: boolean;
  /** Translation key naming the operation, e.g. "board.load" -> "<label> failed". */
  errorLabel?: TranslationKey;
};

/** Runs inside the QueryClientProvider so the idle timer can clear caches. */
function IdleGuard() {
  useIdleLogout();
  return null;
}

/**
 * Last-resort net for promises nobody awaited — `mutateAsync` without a catch,
 * fire-and-forget effects. Without this they vanish into the console.
 */
function UnhandledRejectionGuard() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      notifyError(event.reason, { scope: "unhandled" });
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return null;
}

/**
 * The app's QueryClient, including the two global error nets. Exported so tests
 * exercise the real reporting behaviour rather than a bare QueryClient that
 * silently drops every failure.
 */
export function createAppQueryClient(overrides?: { retryQueries?: number | false }) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const meta = query.meta as ApexMeta | undefined;
        if (meta?.toastSilent) return;
        notifyError(error, {
          action: meta?.errorLabel ? translate(meta.errorLabel) : undefined,
          // Throttle per query so a failing poll reports once, not once per
          // interval (autopilot status polls every 1.5s) — but leave the toast
          // id keyed on the failure, so several queries broken by the same
          // outage collapse into one message.
          throttleKey: query.queryHash,
          throttleMs: 60_000,
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        const meta = mutation.meta as ApexMeta | undefined;
        if (meta?.toastSilent) return;
        notifyError(error, {
          action: meta?.errorLabel ? translate(meta.errorLabel) : undefined,
        });
      },
    }),
    defaultOptions: {
      queries: {
        retry: overrides?.retryQueries ?? 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <IdleGuard />
      <UnhandledRejectionGuard />
      {children}
      {/* theme must track the app's own theme: the app never sets a `dark`
          class on <html>, so sonner cannot infer it and would render every
          toast in light mode over a dark UI. */}
      <Toaster position="bottom-right" richColors closeButton theme={theme} duration={6000} visibleToasts={5} expand />
    </QueryClientProvider>
  );
}
