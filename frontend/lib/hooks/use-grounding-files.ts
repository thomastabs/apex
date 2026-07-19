"use client";

import { useMemo } from "react";
import type { ContextFile } from "@/lib/api/types";
import { useAgentFiles, useContextFiles } from "@/lib/hooks/use-workspace";

export function useGroundingFiles(): ContextFile[] {
  const contextFiles = useContextFiles();
  const agentFiles = useAgentFiles();

  return useMemo(
    () => [
      ...(contextFiles.data?.files ?? []),
      ...(agentFiles.data?.files ?? []).map((file) => ({
        ...file,
        label: `${file.label} (${file.filename})`,
      })),
    ],
    [agentFiles.data?.files, contextFiles.data?.files],
  );
}
