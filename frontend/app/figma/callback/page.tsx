"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Figma, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { figmaOAuthExchange, FIGMA_OAUTH_STATE_KEY } from "@/lib/api/figma";
import { useSessionStore } from "@/lib/stores/session-store";

type Status = "working" | "done" | "error";

function FigmaCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const setFigma = useSessionStore((s) => s.setFigma);
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Completing Figma sign-in…");
  // StrictMode mounts effects twice in dev; the code is single-use, so guard it.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const expected = typeof window !== "undefined" ? sessionStorage.getItem(FIGMA_OAUTH_STATE_KEY) : null;
    if (typeof window !== "undefined") sessionStorage.removeItem(FIGMA_OAUTH_STATE_KEY);

    if (error) {
      setStatus("error");
      setMessage("Figma sign-in was cancelled or denied.");
      return;
    }
    if (!code || !state || !expected || state !== expected) {
      setStatus("error");
      setMessage("Invalid or expired sign-in state. Please try connecting again.");
      return;
    }

    figmaOAuthExchange(code)
      .then(({ access_token }) => {
        if (!access_token) throw new Error("No access token returned.");
        setFigma({ token: access_token });
        setStatus("done");
        setMessage("Connected to Figma. Pick a file to finish linking…");
        setTimeout(() => router.replace("/"), 1200);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Could not complete Figma sign-in.");
      });
  }, [params, router, setFigma]);

  const Icon = status === "working" ? Loader2 : status === "done" ? CheckCircle2 : AlertCircle;
  const tone = status === "error" ? "text-red-500" : status === "done" ? "text-emerald-500" : "text-violet-500";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-violet-500/10">
          <Figma className="size-6 text-violet-500" />
        </span>
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${tone} ${status === "working" ? "animate-spin" : ""}`} />
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>
        </div>
        {status === "error" ? (
          <button
            className="inline-flex h-9 items-center rounded bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-600"
            onClick={() => router.replace("/")}
          >
            Back to Apex
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function FigmaCallbackPage() {
  return (
    <Suspense fallback={null}>
      <FigmaCallback />
    </Suspense>
  );
}
