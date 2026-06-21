"use client";

import { create } from "zustand";

// A single, global "review this regeneration" gate. A regenerate flow that would
// overwrite existing content opens this with the old + new text and an onAccept
// committer; the DiffModal renders the diff and calls accept() or discard().

export type DiffRequest = {
  title: string;
  oldText: string;
  newText: string;
  onAccept: () => void;
  onDiscard?: () => void;
};

type DiffState = {
  open: boolean;
  request: DiffRequest | null;
  requestDiff: (req: DiffRequest) => void;
  accept: () => void;
  discard: () => void;
};

export const useDiffStore = create<DiffState>((set, get) => ({
  open: false,
  request: null,
  requestDiff: (request) => set({ open: true, request }),
  accept: () => {
    const { request } = get();
    request?.onAccept();
    set({ open: false, request: null });
  },
  discard: () => {
    const { request } = get();
    request?.onDiscard?.();
    set({ open: false, request: null });
  },
}));
