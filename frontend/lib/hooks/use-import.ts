"use client";

import { useMutation } from "@tanstack/react-query";
import { importBootstrap, importReconstructEpic } from "@/lib/api/import";
import { useApiContext } from "@/lib/stores/session-store";
import { toast } from "sonner";

export function useImportBootstrap() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: () => importBootstrap(ctx!),
    onError: (err: Error) => toast.error(`Import failed: ${err.message}`),
  });
}

export function useImportReconstructEpic() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: (epicId: number) => importReconstructEpic(ctx!, epicId),
    onError: (err: Error) => toast.error(`Reconstruction failed: ${err.message}`),
  });
}
