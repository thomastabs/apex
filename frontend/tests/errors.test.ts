import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "sonner";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/client";
import { classifyError, type ErrorKind } from "@/lib/errors";
import { notifyError, resetErrorToastThrottle } from "@/lib/error-toast";

beforeEach(() => {
  vi.mocked(toast.error).mockReset();
  resetErrorToastThrottle();
});

describe("classifyError", () => {
  const cases: [string, unknown, ErrorKind][] = [
    ["network failure", new ApiNetworkError(), "offline"],
    ["client-side deadline", new ApiTimeoutError(30_000, "/api/phase1/x"), "timeout"],
    ["401", new ApiError(401, "PM tool rejected the credentials."), "auth-expired"],
    ["403", new ApiError(403, "denied"), "forbidden"],
    ["404", new ApiError(404, "Unknown context file."), "not-found"],
    ["409", new ApiError(409, "conflict"), "conflict"],
    ["422", new ApiError(422, "story_id: field required"), "validation"],
    ["429", new ApiError(429, "Rate limit: max 10 sign-in attempts per minute."), "rate-limited"],
    ["502", new ApiError(502, "Failed to reach Taiga instance."), "upstream"],
    ["503", new ApiError(503, "Could not reach the PM tool."), "upstream"],
    ["504", new ApiError(504, "timed out"), "ai-timeout"],
    ["500", new ApiError(500, "Internal server error"), "server"],
    ["plain Error", new Error("boom"), "unknown"],
  ];

  for (const [label, err, expected] of cases) {
    it(`classifies ${label} as ${expected}`, () => {
      expect(classifyError(err).kind).toBe(expected);
    });
  }

  it("treats a user-initiated abort as cancelled, not an error", () => {
    const abort = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    expect(classifyError(abort).kind).toBe("cancelled");
  });

  it("does NOT treat a client-side timeout as a cancel", () => {
    // The regression this whole change exists for: apiRequest aborts the fetch
    // on its own deadline, and the abort used to be swallowed as if the user
    // had pressed Cancel, so a 5-minute generation failed with zero feedback.
    expect(classifyError(new ApiTimeoutError(300_000, "/api/phase3/tasks")).kind).toBe("timeout");
  });

  it("routes AI-config codes to ai-config regardless of status", () => {
    for (const code of ["ai_key_missing", "ai_key_rejected", "ai_model_rejected", "ai_context_length"]) {
      const err = new ApiError(401, { code, message: "nope" });
      expect(classifyError(err).kind).toBe("ai-config");
    }
  });

  it("separates an AI 429 from a generic request 429", () => {
    expect(classifyError(new ApiError(429, { code: "ai_rate_limit", message: "slow down" })).kind).toBe("ai-rate-limit");
    expect(classifyError(new ApiError(429, { code: "rate_limited", message: "slow down" })).kind).toBe("rate-limited");
  });

  it("reads the backend's structured detail as both message and code", () => {
    const err = new ApiError(400, { code: "ai_model_rejected", message: "Pick a different model." });
    expect(err.message).toBe("Pick a different model.");
    expect(err.code).toBe("ai_model_rejected");
  });

  it("gives equal errors the same dedupe key and different errors different ones", () => {
    const a = classifyError(new ApiError(500, "Internal server error"));
    const b = classifyError(new ApiError(500, "Internal server error"));
    const c = classifyError(new ApiError(404, "Unknown context file."));
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.dedupeKey).not.toBe(c.dedupeKey);
  });
});

describe("notifyError", () => {
  it("shows the backend detail and an actionable hint", () => {
    notifyError(new ApiError(401, "PM tool rejected the credentials. Sign in again."));
    expect(toast.error).toHaveBeenCalledTimes(1);
    const [title, opts] = vi.mocked(toast.error).mock.calls[0];
    expect(title).toBe("Session expired");
    expect(opts?.description).toContain("PM tool rejected the credentials.");
    expect(opts?.description).toContain("Sign out and sign in again");
  });

  it("names the operation when given one", () => {
    notifyError(new ApiError(500, "boom"), { action: "Task generation" });
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe("Task generation failed");
  });

  it("stays silent on a deliberate cancel", () => {
    notifyError(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reuses one toast id so repeats collapse instead of stacking", () => {
    notifyError(new ApiError(500, "boom"));
    notifyError(new ApiError(500, "boom"));
    const ids = vi.mocked(toast.error).mock.calls.map(([, opts]) => opts?.id);
    expect(ids[0]).toBe(ids[1]);
  });

  it("throttles a repeating failure within the window", () => {
    notifyError(new ApiError(500, "boom"), { throttleKey: "poll", throttleMs: 60_000 });
    notifyError(new ApiError(500, "boom"), { throttleKey: "poll", throttleMs: 60_000 });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("throttles each source independently but shows them as one toast", () => {
    // Two different queries broken by the same outage: each gets its own
    // throttle bucket, but they share a toast id so the user sees one message.
    notifyError(new ApiError(500, "boom"), { throttleKey: "queryA", throttleMs: 60_000 });
    notifyError(new ApiError(500, "boom"), { throttleKey: "queryB", throttleMs: 60_000 });
    expect(toast.error).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(toast.error).mock.calls.map(([, opts]) => opts?.id);
    expect(ids[0]).toBe(ids[1]);
  });

  it("keeps errors on screen long enough to read", () => {
    notifyError(new ApiError(500, "boom"));
    expect(vi.mocked(toast.error).mock.calls[0][1]?.duration).toBeGreaterThanOrEqual(8000);
  });
});
