import { describe, it, expect, vi, afterEach } from "vitest";
import { jiraAdapter } from "@/lib/api/jira-adapter";
import type { PmRequestContext } from "@/lib/api/pm-types";

const ctx: PmRequestContext = { token: "tok", baseUrl: "https://acme.atlassian.net", projectId: "APX" };

function mockFetchByPath(handlers: Record<string, () => { status: number; body: unknown }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Match by suffix, longest first — the roles-list URL ends with
    // ".../project/APX/role" while a member-fetch URL ends with ".../role/20",
    // and the latter also happens to *contain* the former as a substring.
    const match = Object.keys(handlers)
      .filter((p) => url.endsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (!match) throw new Error(`no mock for ${url}`);
    const { status, body } = handlers[match]();
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("jiraAdapter.getUsers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips a role entirely when its members fetch throws, instead of listing it with zero members", async () => {
    mockFetchByPath({
      "/project/APX/role": () => ({
        status: 200,
        body: { Administrators: "https://acme.atlassian.net/rest/api/3/role/10", Developers: "https://acme.atlassian.net/rest/api/3/role/20" },
      }),
      "/role/10": () => ({ status: 500, body: { errorMessages: ["boom"] } }),
      "/role/20": () => ({
        status: 200,
        body: { actors: [{ id: 1, displayName: "Dev One", type: "atlassian-user-role-actor", actorUser: { accountId: "acc-1" } }] },
      }),
    });

    const result = await jiraAdapter.getUsers(ctx);

    // Administrators' role-fetch failed → must not appear in roles at all.
    expect(result.roles.map((r) => r.name)).toEqual(["Developers"]);
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0].username).toBe("acc-1");
  });

  it("lists a role once its members fetch succeeds", async () => {
    mockFetchByPath({
      "/project/APX/role": () => ({
        status: 200,
        body: { Developers: "https://acme.atlassian.net/rest/api/3/role/20" },
      }),
      "/role/20": () => ({
        status: 200,
        body: { actors: [{ id: 1, displayName: "Dev One", type: "atlassian-user-role-actor", actorUser: { accountId: "acc-1" } }] },
      }),
    });

    const result = await jiraAdapter.getUsers(ctx);

    expect(result.roles).toEqual([{ id: "20", name: "Developers" }]);
    expect(result.memberships[0].id).toBe("20:acc-1");
  });
});
