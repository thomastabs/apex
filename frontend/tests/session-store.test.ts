import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSessionStore, useApiContext } from "@/lib/stores/session-store";
import { mintId } from "@/lib/api/plane-id-shim";

beforeEach(() => {
  useSessionStore.setState({
    taigaToken: "",
    taigaApiUrl: "",
    projectId: null,
    projectName: "",
  });
});

describe("useSessionStore", () => {
  it("starts with no session", () => {
    const { taigaToken, projectId } = useSessionStore.getState();
    expect(taigaToken).toBeFalsy();
    expect(projectId).toBeNull();
  });

  it("setAuth stores token", () => {
    useSessionStore.getState().setAuth({ taigaToken: "tok", taigaApiUrl: "https://api.example.test/api/v1" });
    expect(useSessionStore.getState().taigaToken).toBe("tok");
    expect(useSessionStore.getState().taigaApiUrl).toBe("https://api.example.test/api/v1");
  });

  it("setProject stores project id and name", () => {
    useSessionStore.getState().setProject({ projectId: 42, projectName: "My Project" });
    const { projectId, projectName } = useSessionStore.getState();
    expect(projectId).toBe(42);
    expect(projectName).toBe("My Project");
  });

  it("clearSession resets all auth state", () => {
    useSessionStore.getState().setAuth({ taigaToken: "tok" });
    useSessionStore.getState().setProject({ projectId: 1, projectName: "P" });
    useSessionStore.getState().clearSession();
    const { taigaToken, projectId } = useSessionStore.getState();
    expect(taigaToken).toBeFalsy();
    expect(projectId).toBeNull();
  });

  it("setAuth stores pmTool=plane and workspaceSlug together", () => {
    useSessionStore.getState().setAuth({ taigaToken: "pat", taigaApiUrl: "https://api.plane.so", pmTool: "plane", workspaceSlug: "my-team" });
    const { taigaToken, pmTool, workspaceSlug } = useSessionStore.getState();
    expect(taigaToken).toBe("pat");
    expect(pmTool).toBe("plane");
    expect(workspaceSlug).toBe("my-team");
  });

  it("clearSession resets workspaceSlug but keeps pmTool", () => {
    useSessionStore.getState().setAuth({ taigaToken: "pat", pmTool: "plane", workspaceSlug: "my-team" });
    useSessionStore.getState().clearSession();
    const { pmTool, workspaceSlug } = useSessionStore.getState();
    expect(pmTool).toBe("plane");
    expect(workspaceSlug).toBe("");
  });
});

describe("useApiContext", () => {
  // Found live (2026-08-10, see plane_integration_plan memory): right after a
  // reload, a persisted Plane projectId (a minted int from a PRIOR page
  // load's id-shim table — plane-id-shim.ts is a module singleton that
  // resets every reload) matches nothing in the fresh table until
  // useRestoreProjectConfig corrects the store a moment later. Before this
  // fix, useApiContext returned a context carrying that unresolvable id
  // anyway, so every project-scoped query fired, threw inside resolveId, and
  // (for queries) retried 2-3x with backoff before surfacing an error toast —
  // a toast storm plus a long-stuck "Loading project context…" toast.
  it("Taiga: returns context even though resolveId is never consulted", () => {
    useSessionStore.setState({
      taigaToken: "tok", taigaApiUrl: "https://api.taiga.io/api/v1", workspaceSlug: "",
      projectId: 42, pmTool: "taiga", pmProjectSlug: "", projectInstanceUrl: "https://api.taiga.io/api/v1",
    });
    const { result } = renderHook(() => useApiContext());
    expect(result.current).toEqual(expect.objectContaining({ projectId: 42, pmTool: "taiga" }));
  });

  it("Plane: returns null (not a doomed context) when the persisted id isn't in this session's id-shim table", () => {
    useSessionStore.setState({
      taigaToken: "pat", taigaApiUrl: "https://api.plane.so", workspaceSlug: "my-team",
      // Never minted this session — plane-id-shim.ts's map is a fresh, empty
      // module singleton in this test file, so any int here is unresolvable.
      projectId: 999_999, pmTool: "plane", pmProjectSlug: "", projectInstanceUrl: "https://api.plane.so",
    });
    const { result } = renderHook(() => useApiContext());
    expect(result.current).toBeNull();
  });

  it("Plane: returns context once the id IS resolvable this session", () => {
    const minted = mintId("11111111-2222-3333-4444-555555555555");
    useSessionStore.setState({
      taigaToken: "pat", taigaApiUrl: "https://api.plane.so", workspaceSlug: "my-team",
      projectId: minted, pmTool: "plane", pmProjectSlug: "", projectInstanceUrl: "https://api.plane.so",
    });
    const { result } = renderHook(() => useApiContext());
    expect(result.current).toEqual(expect.objectContaining({ projectId: minted, pmTool: "plane" }));
  });
});
