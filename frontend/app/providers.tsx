"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast, Toaster } from "sonner";
import { useIdleLogout } from "@/lib/hooks/use-idle-logout";

/** Runs inside the QueryClientProvider so the idle timer can clear caches. */
function IdleGuard() {
  useIdleLogout();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 401) {
              toast.error("Session expired — please sign in again");
            }
          },
        }),
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <IdleGuard />
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
