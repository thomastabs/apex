"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/use-translation";

export default function ErrorPage({
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
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium text-red-500">{t("errors.appCrashed.title")}</p>
      <p className="max-w-md text-xs text-neutral-400">{error.message || t("errors.appCrashed.body")}</p>
      {error.digest ? <p className="font-mono text-[11px] text-neutral-500">{error.digest}</p> : null}
      <button
        onClick={reset}
        className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
      >
        {t("errors.appCrashed.reload")}
      </button>
    </div>
  );
}
