import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchGithubFile } from "@/lib/api/github-browser";

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchGithubFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes base64 content as UTF-8, not byte-per-char Latin-1", async () => {
    const text = "café — 日本語";
    mockFetchOnce({ content: base64Utf8(text), encoding: "base64" });

    const out = await fetchGithubFile({ owner: "o", repo: "r", pat: "tok" }, "README.md");

    expect(out).toBe(text);
  });

  it("URL-encodes each path segment while preserving slashes", async () => {
    const fetchMock = mockFetchOnce({ content: base64Utf8("x"), encoding: "base64" });

    await fetchGithubFile({ owner: "o", repo: "r", pat: "tok" }, "src/my file (1).ts");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/contents/src/my%20file%20(1).ts");
  });

  it("returns empty string when content is not base64-encoded", async () => {
    mockFetchOnce({ encoding: "none" });

    const out = await fetchGithubFile({ owner: "o", repo: "r", pat: "tok" }, "README.md");

    expect(out).toBe("");
  });
});
