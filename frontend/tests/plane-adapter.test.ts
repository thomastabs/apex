import { beforeEach, describe, expect, it, vi } from "vitest";
import { planeAdapter } from "@/lib/api/plane-adapter";
import { mintId } from "@/lib/api/plane-direct";
import type { PmAuthContext } from "@/lib/api/pm-types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("planeAdapter — Project CRUD wiring", () => {
  const auth: PmAuthContext = { token: "key", baseUrl: "https://api.plane.so", workspaceSlug: "my-team" };

  describe("createProject", () => {
    it("throws when opts.identifier is missing, without calling fetch", () => {
      // createProject's identifier-gate throws synchronously (not an async
      // function), so it must be exercised as a throwing call, not a rejected promise.
      expect(() => planeAdapter.createProject(auth, "New Project", "desc")).toThrow(
        /Creating a Plane project without an identifier is not yet supported for Plane\./,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws when opts.identifier is an empty string, without calling fetch", () => {
      expect(() => planeAdapter.createProject(auth, "New Project", "desc", { identifier: "" })).toThrow(
        /Creating a Plane project without an identifier is not yet supported for Plane\./,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("calls through to planeCreateProject with the right args when identifier is present", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(201, {
        id: "proj-uuid", name: "New Project", identifier: "NEWP", description: "desc",
      }));

      const project = await planeAdapter.createProject(auth, "New Project", "desc", { identifier: "NEWP" });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/workspaces/my-team/projects/");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        name: "New Project",
        identifier: "NEWP",
        description: "desc",
        module_view: true,
        page_view: true,
        issue_views_view: true,
      });
      expect(project.name).toBe("New Project");
      expect(project.slug).toBe("NEWP");
    });

    it("throws the 'Plane workspace slug is required' error when auth.workspaceSlug is missing", () => {
      const noSlugAuth: PmAuthContext = { token: "key", baseUrl: "https://api.plane.so" };
      expect(() => planeAdapter.createProject(noSlugAuth, "New Project", "desc", { identifier: "NEWP" })).toThrow(
        /Plane workspace slug is required/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("updateProject", () => {
    it("passes requireWorkspaceSlug(auth)'s result through to planeUpdateProject correctly", async () => {
      const minted = String(mintId("proj-update-uuid"));
      mockFetch
        .mockResolvedValueOnce(makeResponse(200, {}))
        .mockResolvedValueOnce(makeResponse(200, { id: "proj-update-uuid", name: "Renamed", identifier: "X", description: "D" }));

      const project = await planeAdapter.updateProject(auth, minted, { name: "Renamed" });

      const [patchUrl, patchInit] = mockFetch.mock.calls[0];
      expect(patchUrl).toContain("/workspaces/my-team/projects/proj-update-uuid/");
      expect(patchInit.method).toBe("PATCH");
      expect(JSON.parse(patchInit.body)).toEqual({ name: "Renamed" });
      expect(project.name).toBe("Renamed");
    });

    it("throws the 'Plane workspace slug is required' error when auth.workspaceSlug is missing", () => {
      const noSlugAuth: PmAuthContext = { token: "key", baseUrl: "https://api.plane.so" };
      const minted = String(mintId("proj-update-uuid-noslug"));
      expect(() => planeAdapter.updateProject(noSlugAuth, minted, { name: "x" })).toThrow(
        /Plane workspace slug is required/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("deleteProject", () => {
    it("passes requireWorkspaceSlug(auth)'s result through to planeDeleteProject correctly", async () => {
      const minted = String(mintId("proj-delete-uuid"));
      mockFetch.mockResolvedValueOnce(makeResponse(204, {}));

      const result = await planeAdapter.deleteProject(auth, minted);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/workspaces/my-team/projects/proj-delete-uuid/");
      expect(init.method).toBe("DELETE");
      expect(result).toEqual({ ok: true });
    });

    it("throws the 'Plane workspace slug is required' error when auth.workspaceSlug is missing", () => {
      const noSlugAuth: PmAuthContext = { token: "key", baseUrl: "https://api.plane.so" };
      const minted = String(mintId("proj-delete-uuid-noslug"));
      expect(() => planeAdapter.deleteProject(noSlugAuth, minted)).toThrow(/Plane workspace slug is required/);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
