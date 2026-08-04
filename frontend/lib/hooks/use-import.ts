"use client";

import { useMutation } from "@tanstack/react-query";
import { importBootstrap, importReconstructEpic } from "@/lib/api/import";
import { useApiContext } from "@/lib/stores/session-store";

export function useImportBootstrap() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: () => importBootstrap(ctx!),
    meta: { errorLabel: "op.import" },
  });
}

export function useImportReconstructEpic() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: (epicId: number) => importReconstructEpic(ctx!, epicId),
    meta: { errorLabel: "op.reconstructEpic" },
  });
}
