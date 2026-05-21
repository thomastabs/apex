"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium text-red-500">Something went wrong</p>
      <p className="max-w-md text-xs text-gray-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded bg-gray-800 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
      >
        Try again
      </button>
    </div>
  );
}
