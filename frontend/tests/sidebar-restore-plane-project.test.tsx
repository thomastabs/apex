import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";

// Renders the real, exported <Sidebar/> — useRestoreProjectConfig() itself is
// an internal (non-exported) hook inside components/sidebar.tsx, so this is
// the only way to exercise it. Sidebar is collapsed for the whole test (see
// beforeEach) so the render tree stays small: the collapsed branch only
// mounts <SettingsModal> (returns null while closed), <GithubAutoSync/> and
// <FigmaAutoRestore/> alongside the plain nav icons — everything else
// (GitHubSection, FigmaSection, board/tasks/etc. sections) lives behind the
// Settings dialog and is never instantiated.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    message: vi.fn(), loading: vi.fn(), dismiss: vi.fn(),
  },
}));

const ME = { id: 1, username: "tomas", full_name: "Tomas", email: "t@example.test" };

// A fresh session (nothing in sessionStorage) but the backend remembers a
// last-active Plane project as its real UUID — the scenario this whole test
// exercises.
const SERVER_PROJECT_UUID = "cccccccc-dddd-eeee-ffff-000000000000";
const SERVER_CONFIG = {
  project_id: SERVER_PROJECT_UUID,
  taiga_web_url: "",
  pm_tool: "plane",
  pm_web_url: "https://app.plane.so",
  github_repo: "",
  figma_file_key: "",
  github_pat_configured: false,
  figma_token_configured: false,
};

// Mutable so the test can populate it (with a project whose id matches the
// minted id under test) right before rendering, without needing the value
// at vi.mock-factory-registration time.
let PROJECTS: { id: number; name: string; slug?: string }[] = [];

vi.mock("@/lib/hooks/use-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-workspace")>();
  return {
    ...actual,
    useMe: () => ({ data: ME, isError: false, error: null }),
    useServerConfig: () => ({ data: SERVER_CONFIG, isLoading: false }),
    useProjects: () => ({ data: PROJECTS, isLoading: false }),
    useStoryIndexStats: () => ({ data: undefined }),
    useGithubPat: () => ({ data: undefined, isFetching: false }),
    useFigmaToken: () => ({ data: undefined, isFetching: false }),
  };
});

vi.mock("@/lib/hooks/use-phase3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-phase3")>();
  return { ...actual, useBoltsList: () => ({ data: [], isLoading: false }) };
});

import { Sidebar } from "@/components/sidebar";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { mintId } from "@/lib/api/plane-direct";

function renderSidebar() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Sidebar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  PROJECTS = [];
  useUiStore.setState({ sidebarCollapsed: true });
  useSessionStore.setState({
    pmTool: "plane",
    taigaToken: "pat",
    taigaApiUrl: "https://api.plane.so",
    workspaceSlug: "my-team",
    projectId: null,
    projectName: "",
    pmProjectSlug: "",
    projectInstanceUrl: "",
    planeProjectId: "",
    githubPat: "",
    githubRepo: "",
    figmaToken: "",
    figmaFileKey: "",
  });
});

describe("useRestoreProjectConfig (via Sidebar) — Plane server-fallback branch", () => {
  it("mints the server-supplied UUID into a fresh session id and sets it, never the raw UUID", async () => {
    // Same UUID the mocked useProjects() below resolves to — mint it up
    // front so the assertion knows the exact expected minted int, and so a
    // matching project (by that minted id) is present for the projectName
    // lookup, per this repo's mintId/resolveId test idiom.
    const expectedMintedId = mintId(SERVER_PROJECT_UUID);
    PROJECTS = [{ id: expectedMintedId, name: "Plane Project", slug: "plane-project" }];

    renderSidebar();

    await waitFor(() => {
      expect(useSessionStore.getState().projectId).toBe(expectedMintedId);
    });

    const state = useSessionStore.getState();
    // The raw UUID string must never land in projectId — every Plane call
    // site downstream assumes projectId is a minted int (plane-id-shim.ts).
    expect(state.projectId).not.toBe(SERVER_PROJECT_UUID);
    expect(typeof state.projectId).toBe("number");
    expect(state.projectName).toBe("Plane Project");
  });
});
