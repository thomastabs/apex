import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, apiRequest } from "@/lib/api/client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("apiRequest", () => {
  it("returns parsed JSON on 2xx", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, { ok: true }));
    const result = await apiRequest<{ ok: boolean }>("/test");
    expect(result).toEqual({ ok: true });
  });

  it("throws ApiError with status on 4xx", async () => {
    mockFetch.mockResolvedValue(makeResponse(401, { detail: "Unauthorized" }));
    await expect(apiRequest("/test")).rejects.toThrow(ApiError);
    await expect(apiRequest("/test")).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError on 500", async () => {
    mockFetch.mockResolvedValue(makeResponse(500, { detail: "Server error" }));
    await expect(apiRequest("/test")).rejects.toMatchObject({ status: 500 });
  });

  it("sets Authorization header when token provided", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, {}));
    await apiRequest("/test", { context: { taigaToken: "tok123" } as never });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok123" }),
      }),
    );
  });

  it("aborts request when external signal fires", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() => {
      controller.abort();
      return new Promise((_, reject) =>
        reject(Object.assign(new Error("AbortError"), { name: "AbortError" })),
      );
    });
    await expect(
      apiRequest("/test", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
