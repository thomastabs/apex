import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));

import { DiffModal } from "@/components/ui/diff-modal";
import { useDiffStore } from "@/lib/stores/diff-store";

beforeEach(() => {
  useDiffStore.setState({ open: false, request: null });
});

describe("DiffModal", () => {
  it("is hidden until a diff is requested", () => {
    render(<DiffModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders added/removed lines and Accept commits", () => {
    const onAccept = vi.fn();
    render(<DiffModal />);
    act(() => {
      useDiffStore.getState().requestDiff({
        title: "Dev pack — task #5",
        oldText: "keep\nold line",
        newText: "keep\nnew line",
        onAccept,
      });
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("old line")).toBeInTheDocument();   // removed
    expect(screen.getByText("new line")).toBeInTheDocument();   // added
    fireEvent.click(screen.getByRole("button", { name: /Accept changes/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(useDiffStore.getState().open).toBe(false);
  });

  it("Discard fires onDiscard and keeps current (no onAccept)", () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    render(<DiffModal />);
    act(() => {
      useDiffStore.getState().requestDiff({ title: "x", oldText: "a", newText: "b", onAccept, onDiscard });
    });
    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(useDiffStore.getState().open).toBe(false);
  });
});
