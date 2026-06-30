"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { AutopilotSetupForm } from "@/components/autopilot/setup-form";
import { AutopilotRunView } from "@/components/autopilot/run-view";
import {
  useStartAutopilot,
  useAutopilotStatus,
  useAutopilotStream,
  usePersistedAutopilot,
  useResumeInterruptedAutopilot,
  useClearPersistedAutopilot,
} from "@/lib/hooks/use-autopilot";
import { useSessionStore, useFigmaContext } from "@/lib/stores/session-store";
import type { AutopilotStartRequest } from "@/lib/api/autopilot";

export default function AutopilotPage() {
  const hasProject = useSessionStore((s) => Boolean(s.taigaToken && s.projectId));
  const figma = useFigmaContext();
  const figmaToken = useSessionStore((s) => s.figmaToken);
  const storedJobId = useSessionStore((s) => s.autopilotJobId);
  const setStoredJobId = useSessionStore((s) => s.setAutopilotJobId);
  // jobId is seeded from the persisted store so a refresh re-attaches to a run.
  const [jobId, setJobIdState] = useState<string | null>(storedJobId);
  const setJobId = (id: string | null) => { setJobIdState(id); setStoredJobId(id); };

  const start = useStartAutopilot();
  const resumeInterrupted = useResumeInterruptedAutopilot();
  const clearPersisted = useClearPersistedAutopilot();
  const { data: liveStatus } = useAutopilotStatus(jobId);
  // Discover/recover the project's job when there's no live one (refresh / restart).
  const { data: persistedStatus } = usePersistedAutopilot(!liveStatus);

  const status = liveStatus ?? persistedStatus ?? null;
  const terminal = status ? ["done", "stopped", "error"].includes(status.state) : false;
  // Stream only a genuinely live run; an interrupted/terminal job has no thread.
  useAutopilotStream(jobId, Boolean(jobId) && status?.state === "running");

  // Adopt the discovered job id (e.g. after a refresh) so controls/stream target it.
  useEffect(() => {
    if (!jobId && persistedStatus?.job_id) setJobId(persistedStatus.job_id);
  }, [jobId, persistedStatus?.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart(req: AutopilotStartRequest) {
    let body = req;
    if (req.figma_project_id) {
      // Project mode (file-as-epic): the token comes from the session (a file need
      // not be connected, but Figma must be set up so the token is present).
      body = { ...req, figma_token: figmaToken };
    } else if (figma) {
      // Single-file seeding when a file is connected.
      body = { ...req, figma_file_key: figma.fileKey, figma_token: figma.token };
    }
    const res = await start.mutateAsync(body);
    setJobId(res.job_id);
  }

  async function handleResume() {
    const res = await resumeInterrupted.mutateAsync();
    setJobId(res.job_id);
  }

  function handleReset() {
    clearPersisted.mutate();
    setJobId(null);
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

      {!status ? (
        <AutopilotSetupForm onStart={handleStart} isPending={start.isPending} />
      ) : (
        <AutopilotRunView
          status={status}
          onReset={handleReset}
          onResume={status.state === "interrupted" ? handleResume : undefined}
          resuming={resumeInterrupted.isPending}
        />
      )}
    </section>
  );
}
