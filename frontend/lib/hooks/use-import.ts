"use client";

import { useMutation } from "@tanstack/react-query";
import { importBootstrap, importPlaneBootstrap, importReconstructEpic } from "@/lib/api/import";
import { getBoard } from "@/lib/api/workspace";
import { useApiContext } from "@/lib/stores/session-store";

export function useImportBootstrap() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: () => (ctx?.pmTool === "plane" ? importPlaneBootstrap(ctx) : importBootstrap(ctx!)),
    meta: { errorLabel: "op.import" },
  });
}

export function useImportReconstructEpic() {
  const ctx = useApiContext();
  return useMutation({
    mutationFn: async (epicId: number) => {
      // Plane (phase 5c, see plane_integration_plan memory): no server-side
      // cache of story descriptions exists between Step 1 (bootstrap) and
      // this action — re-fetch the board now, client-side, via the same
      // tested adapter path bootstrap already used, rather than introducing
      // a new caching layer for what's a deliberately rare, manually-
      // triggered action. Sends every story's description (not just this
      // epic's) — cheap (one board fetch, already the bootstrap's own size)
      // and lets the backend do the epic match against its own story index
      // via mint_pm_id, rather than duplicating that id-mapping client-side.
      if (ctx?.pmTool === "plane") {
        const board = await getBoard(ctx);
        const stories = board.flatMap((epic) =>
          epic.stories
            .filter((story) => story.pm_story_id)
            .map((story) => ({ pm_story_id: story.pm_story_id!, description: story.description })),
        );
        return importReconstructEpic(ctx, epicId, stories);
      }
      return importReconstructEpic(ctx!, epicId);
    },
    meta: { errorLabel: "op.reconstructEpic" },
  });
}
