import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";

const clearSession = vi.fn();
let token = "tok";

vi.mock("@/lib/stores/session-store", () => ({
  useSessionStore: { getState: () => ({ taigaToken: token, clearSession }) },
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { useIdleLogout } from "@/lib/hooks/use-idle-logout";

const IDLE_MS = 30 * 60 * 1000;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // Fake only the timer APIs the hook uses — faking everything stalls React's
  // internal scheduler and hangs renderHook.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  clearSession.mockClear();
  token = "tok";
});
afterEach(() => vi.useRealTimers());

describe("useIdleLogout", () => {
  it("clears the session after the idle window elapses", () => {
    renderHook(() => useIdleLogout(), { wrapper });
    act(() => vi.advanceTimersByTime(IDLE_MS + 1000));
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("activity resets the timer so an active user is not logged out", () => {
    renderHook(() => useIdleLogout(), { wrapper });
    act(() => vi.advanceTimersByTime(IDLE_MS - 5000)); // almost idle
    act(() => window.dispatchEvent(new Event("keydown"))); // user activity
    act(() => vi.advanceTimersByTime(10_000)); // would have fired without the reset
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("does nothing when there is no active session", () => {
    token = "";
    renderHook(() => useIdleLogout(), { wrapper });
    act(() => vi.advanceTimersByTime(IDLE_MS + 1000));
    expect(clearSession).not.toHaveBeenCalled();
  });
});
