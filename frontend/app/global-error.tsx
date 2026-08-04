"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/use-translation";

/**
 * Catches crashes in the root layout itself, where `app/error.tsx` cannot run
 * (its boundary lives inside the layout). Must render its own <html>/<body>
 * because it replaces the whole document. No providers are mounted here, so it
 * depends only on the Zustand store, which is provider-free.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm font-medium text-red-500">{t("errors.appCrashed.title")}</p>
          <p className="max-w-md text-xs text-neutral-400">{t("errors.appCrashed.body")}</p>
          {error.digest ? <p className="font-mono text-[11px] text-neutral-500">{error.digest}</p> : null}
          <button
            onClick={reset}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
          >
            {t("errors.appCrashed.reload")}
          </button>
        </div>
      </body>
    </html>
  );
}
