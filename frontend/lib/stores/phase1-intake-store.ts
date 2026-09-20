"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// One-shot handoff payload from Maintenance's change-request placement review
// into Phase 1's intake. Persisted (localStorage, same pattern as
// apex-phase3-draft) so it survives the router.push("/phase1") navigation and
// a full page reload, but it is a SINGLE pending slot: writing a new payload
// replaces any unconsumed one, and Phase 1 clears it the moment it is read so
// a later fresh visit to Phase 1 never replays a stale handoff.
export type Phase1IntakePayload = {
  mode: "create" | "load";
  epicId: number | null;
  epicTitle: string;
  nlDraft: string;
  fromMaintenanceItemId: number;
};

type Phase1IntakeState = {
  pending: Phase1IntakePayload | null;
  setPending: (payload: Phase1IntakePayload) => void;
  /** Reads and clears the pending payload in one step. */
  consumePending: () => Phase1IntakePayload | null;
  clearPending: () => void;
};

export const usePhase1IntakeStore = create<Phase1IntakeState>()(
  persist(
    (set, get) => ({
      pending: null,
      setPending: (payload) => set({ pending: payload }),
      consumePending: () => {
        const pending = get().pending;
        if (pending) set({ pending: null });
        return pending;
      },
      clearPending: () => set({ pending: null }),
    }),
    { name: "apex-phase1-intake" },
  ),
);
