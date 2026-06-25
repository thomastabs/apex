"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { AutopilotSetupForm } from "@/components/autopilot/setup-form";
import { AutopilotRunView } from "@/components/autopilot/run-view";
import { useStartAutopilot, useAutopilotStatus } from "@/lib/hooks/use-autopilot";
import { useSessionStore } from "@/lib/stores/session-store";
import type { AutopilotStartRequest } from "@/lib/api/autopilot";

export default function AutopilotPage() {
  const hasProject = useSessionStore((s) => Boolean(s.taigaToken && s.projectId));
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useStartAutopilot();
  const { data: status } = useAutopilotStatus(jobId);

  async function handleStart(req: AutopilotStartRequest) {
    const res = await start.mutateAsync(req);
    setJobId(res.job_id);
  }

  if (!hasProject) {
    return (
      <section className="px-8 py-8">
        <div className="flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-400">Sign in required</p>
            <p className="mt-0.5 text-amber-500/80">Sign in and select a project via the sidebar to use Autopilot.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-8 py-8">
      <div className="mb-6 border-b border-neutral-800 pb-6">
        <h1 className="text-2xl font-bold text-neutral-100">Autopilot</h1>
        <p className="mt-1 text-sm text-neutral-500">
          AI-driven full SDLC pipeline — Phases 1 through 5, fully automated with human-in-the-loop checkpoints.
        </p>
      </div>

      {!jobId || !status ? (
        <AutopilotSetupForm onStart={handleStart} isPending={start.isPending} />
      ) : (
        <AutopilotRunView
          status={status}
          onReset={() => setJobId(null)}
        />
      )}
    </section>
  );
}
