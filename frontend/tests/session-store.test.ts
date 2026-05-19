import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "@/lib/stores/session-store";

beforeEach(() => {
  useSessionStore.setState({
    taigaToken: "",
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
    useSessionStore.getState().setAuth({ taigaToken: "tok" });
    expect(useSessionStore.getState().taigaToken).toBe("tok");
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
});
