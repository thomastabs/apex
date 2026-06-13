"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, ExternalLink, Moon, PanelLeftOpen, Send, Sun, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAiConfig, useMe, useProjects, useServerConfig } from "@/lib/hooks/use-workspace";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError, apiRequest, getApiBaseUrl } from "@/lib/api/client";
import { clearJiraProjectTypeCache } from "@/lib/api/jira-adapter";
import { BoardSection } from "./sidebar/board-section";
import { ProjectSection } from "./sidebar/project-section";
import { UsersSection } from "./sidebar/users-section";
import { ContextSection } from "./sidebar/context-section";
import { AiSection } from "./sidebar/ai-section";
import { ResourcesSection } from "./sidebar/resources-section";
import { GitHubSection } from "./sidebar/github-section";
import { TasksSection } from "./sidebar/tasks-section";
import { PacksSection } from "./sidebar/packs-section";
import { AboutSection } from "./sidebar/about-section";

// ── constants ─────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  project: "Project",
  board: "Epics & Stories",
  users: "Users & Roles",
  context: "Active Context",
  ai: "AI Models",
  resources: "Resources",
  github: "GitHub",
  tasks: "Task Board",
  packs: "Developer Packs",
  about: "About Apex",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "TO";
  return clean.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  open, message, onConfirm, onCancel,
}: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80" onClick={onCancel}>
      <div
        className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-5 text-sm text-neutral-200">{message}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded bg-red-700 py-2 text-sm font-semibold text-white hover:bg-red-600"
            onClick={onConfirm}
          >
            Confirm
          </button>
          <button
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Login section ─────────────────────────────────────────────────────────────

function LoginSection({ pmWebUrl }: { pmWebUrl: string }) {
  const setAuth = useSessionStore((state) => state.setAuth);
  const clearSession = useSessionStore((state) => state.clearSession);
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const storedPmTool = useSessionStore((state) => state.pmTool);
  const storedTaigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const clearPhase2Draft = usePhase2Store((state) => state.clearPhase2Draft);
  const queryClient = useQueryClient();
  const me = useMe();

  // Drive pmTool from store so it tracks clearSession/sign-out resets correctly
  const [pmTool, setPmTool] = useState<"taiga" | "jira">(storedPmTool);
  // Sync local selector state when store changes (e.g. after sign-out resets pmTool)
  useEffect(() => { setPmTool(storedPmTool); }, [storedPmTool]);
  const [mode, setMode] = useState<"password" | "token">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState(pmTool === "taiga" ? taigaToken : "");
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [taigaInstanceUrl, setTaigaInstanceUrl] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // When the user supplies a private instance URL, prefer it; otherwise fall back
  // to the server-configured pmWebUrl (cloud: tree→api) or the public cloud default.
  const effectiveTaigaApiUrl = taigaInstanceUrl.trim()
    ? taigaInstanceUrl.trim().replace(/\/+$/, "").replace("//tree.", "//api.").replace(/\/api\/v1$/, "")
    : pmWebUrl.includes("taiga")
      ? pmWebUrl.replace("//tree.", "//api.")
      : "https://api.taiga.io";

  async function handlePasswordLogin() {
    if (!username.trim() || !password.trim()) return;
    setIsPending(true);
    setLoginError("");
    try {
      // Route through the backend proxy — direct browser→Taiga calls fail with CORS on self-hosted instances.
      const res = await fetch(`${getApiBaseUrl()}/api/pm/taiga/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Taiga-Url": effectiveTaigaApiUrl,
        },
        body: JSON.stringify({ username: username.trim(), password, type: "normal" }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const detail = (data as Record<string, unknown>).detail as string | undefined;
        setLoginError(
          detail
            ? detail
            : res.status === 401
              ? "Invalid username or password."
              : `Login failed — server returned ${res.status}.`
        );
        return;
      }
      const token = data.auth_token as string;
      queryClient.setQueryData(["workspace", "me"], {
        id: data.id,
        username: data.username,
        full_name: data.full_name,
        email: data.email,
      });
      setPassword("");
      setUsername("");
      await apiRequest("/api/workspace/config", {
        method: "POST",
        context: { taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" },
        body: { pm_tool: "taiga", taiga_url: effectiveTaigaApiUrl, jira_base_url: "" },
      }).catch(() => undefined);
      setAuth({ taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" });
    } catch {
      setLoginError("Cannot reach Apex backend — check your network.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleJiraLogin() {
    const domain = jiraDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const email = jiraEmail.trim();
    const apiToken = jiraApiToken.trim();
    if (!domain || !email || !apiToken) {
      setLoginError("Domain, email, and API token are required.");
      return;
    }
    setIsPending(true);
    setLoginError("");
    try {
      const jiraBaseUrl = `https://${domain}`;
      const encodedToken = btoa(`${email}:${apiToken}`);
      const res = await fetch(`${getApiBaseUrl()}/api/pm/jira/myself`, {
        headers: {
          Authorization: `Basic ${encodedToken}`,
          Accept: "application/json",
          "X-Jira-Base-Url": jiraBaseUrl,
        },
      });
      if (!res.ok) {
        setLoginError(
          res.status === 401 || res.status === 403
            ? "Authentication failed — check your credentials."
            : `Authentication failed — server returned ${res.status}.`
        );
        return;
      }
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      queryClient.setQueryData(["workspace", "me"], {
        id: undefined,
        username: (data.emailAddress as string) || (data.displayName as string) || email,
        full_name: (data.displayName as string) || "",
        email: (data.emailAddress as string) || email,
      });
      // Persist pm_tool + jira_base_url to server config so the proxy can forward
      // subsequent requests without requiring X-Jira-Base-Url on every call.
      await apiRequest("/api/workspace/config", {
        method: "POST",
        context: { taigaToken: encodedToken, taigaApiUrl: jiraBaseUrl, pmTool: "jira" },
        body: { pm_tool: "jira", jira_base_url: jiraBaseUrl },
      }).catch(() => undefined); // non-fatal: proxy falls back to X-Jira-Base-Url header
      setJiraApiToken("");
      setJiraEmail("");
      setAuth({ taigaToken: encodedToken, taigaApiUrl: jiraBaseUrl, pmTool: "jira", jiraEmail: email });
    } catch {
      setLoginError("Cannot reach Jira — check your domain and network.");
    } finally {
      setIsPending(false);
    }
  }

  const displayName = me.data?.full_name || me.data?.username || (taigaToken ? "User" : "");
  const email = me.data?.email || "";

  if (taigaToken) {
    const pmLabel = storedPmTool === "jira" ? "Jira Cloud" : "Taiga";
    const pmColor = storedPmTool === "jira"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
      : "border-violet-500/30 bg-violet-500/10 text-violet-400";
    return (
      <div className="flex items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded bg-violet-950 text-xs font-bold text-violet-300">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{displayName || "User"}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", pmColor)}>
              {pmLabel}
            </span>
            {email ? (
              <span className="truncate text-xs text-neutral-500">{email}</span>
            ) : (
              <span className="text-xs text-neutral-500">Authenticated</span>
            )}
          </div>
          {storedPmTool === "taiga" && storedTaigaApiUrl && storedTaigaApiUrl !== "https://api.taiga.io" && (
            <div className="truncate text-[10px] text-neutral-500 mt-0.5">{storedTaigaApiUrl}</div>
          )}
        </div>
        <button
          className="shrink-0 rounded border border-violet-500/30 px-2 py-1 text-xs text-violet-400 transition-colors hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-300"
          onClick={() => { clearJiraProjectTypeCache(); clearSession(); clearPhase2Draft(); queryClient.clear(); }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* PM Tool Selector */}
      <div className="grid grid-cols-2 rounded-md bg-neutral-800 p-1">
        <button
          className={cn("h-9 rounded text-xs text-neutral-200", pmTool === "taiga" && "bg-violet-600 text-white")}
          onClick={() => { setPmTool("taiga"); setLoginError(""); }}
        >
          Taiga
        </button>
        <button
          className={cn("h-9 rounded text-xs text-neutral-200", pmTool === "jira" && "bg-violet-600 text-white")}
          onClick={() => { setPmTool("jira"); setLoginError(""); }}
        >
          Jira Cloud
        </button>
      </div>

      {pmTool === "taiga" ? (
        <>
          <div className="grid grid-cols-2 rounded-md bg-neutral-800 p-1">
            <button
              className={cn("h-9 rounded text-xs text-neutral-200", mode === "password" && "bg-neutral-700 text-white")}
              onClick={() => setMode("password")}
            >
              Username / Password
            </button>
            <button
              className={cn("h-9 rounded text-xs text-neutral-200", mode === "token" && "bg-neutral-700 text-white")}
              onClick={() => setMode("token")}
            >
              Auth Token
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">
              Taiga instance URL <span className="text-neutral-600">(leave blank for Taiga Cloud)</span>
            </label>
            <input
              value={taigaInstanceUrl}
              onChange={(e) => setTaigaInstanceUrl(e.target.value)}
              className="h-9 w-full rounded border border-violet-500/50 bg-neutral-950 px-3 text-sm text-white outline-none placeholder:text-neutral-600"
              placeholder="https://taiga.yourcompany.com"
              autoComplete="off"
            />
          </div>
          {mode === "password" ? (
            <>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
                placeholder="Username"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 pr-9 text-sm text-white outline-none"
                  placeholder="Password"
                  onKeyDown={(e) => { if (e.key === "Enter") handlePasswordLogin(); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 flex items-center text-neutral-500 hover:text-neutral-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600">
                For better security use{" "}
                <button
                  type="button"
                  className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  onClick={() => setMode("token")}
                >
                  Auth Token
                </button>{" "}
                — no password transmitted.
              </p>
            </>
          ) : (
            <input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
              placeholder="Taiga auth token"
            />
          )}
          {loginError ? <p className="text-xs text-red-400">{loginError}</p> : null}
          <button
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
            disabled={isPending}
            onClick={() => {
              if (mode === "password") {
                handlePasswordLogin();
              } else if (tokenInput.trim()) {
                const token = tokenInput.trim();
                void apiRequest("/api/workspace/config", {
                  method: "POST",
                  context: { taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" },
                  body: { pm_tool: "taiga", taiga_url: effectiveTaigaApiUrl, jira_base_url: "" },
                }).catch(() => undefined);
                setAuth({ taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" });
              }
            }}
          >
            <Send className="size-4" />
            {isPending ? "Signing in..." : "Sign in to Taiga"}
          </button>
          <a
            href={pmWebUrl || "https://tree.taiga.io"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-violet-300"
          >
            <UserPlus className="size-3" />
            Create a Taiga account
          </a>
        </>
      ) : (
        <>
          <div className="rounded border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-300/80 space-y-0.5">
            <p className="font-semibold text-blue-800 dark:text-blue-300">How to connect:</p>
            <p>1. Enter your Jira site domain below</p>
            <p>2. Enter your Atlassian account email</p>
            <p>3. <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200">Generate an API token</a> and paste it</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Jira site domain</label>
            <input
              value={jiraDomain}
              onChange={(e) => setJiraDomain(e.target.value)}
              className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
              placeholder="yourcompany.atlassian.net"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Atlassian account email</label>
            <input
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between text-xs text-neutral-500">
              <span>API token</span>
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                Generate token <ExternalLink className="size-3" />
              </a>
            </label>
            <input
              type="password"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
              className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
              placeholder="ATATT3xFfGF0…"
              onKeyDown={(e) => { if (e.key === "Enter") handleJiraLogin(); }}
              autoComplete="off"
            />
          </div>
          {loginError ? <p className="text-xs text-red-400">{loginError}</p> : null}
          <button
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-blue-700 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
            disabled={isPending}
            onClick={handleJiraLogin}
          >
            <Send className="size-4" />
            {isPending ? "Connecting…" : "Connect to Jira"}
          </button>
        </>
      )}
    </div>
  );
}

// ── session hooks ─────────────────────────────────────────────────────────────

function useRestoreSession() {
  const taigaToken = useSessionStore((s) => s.taigaToken);
  const clearSession = useSessionStore((s) => s.clearSession);
  const clearPhase2Draft = usePhase2Store((s) => s.clearPhase2Draft);
  const queryClient = useQueryClient();
  const me = useMe();

  useEffect(() => {
    if (!taigaToken) return;
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      toast.error("Session expired — please sign in again.");
      clearSession();
      clearPhase2Draft();
      queryClient.clear();
    }
  }, [taigaToken, me.isError, me.error, clearSession, clearPhase2Draft, queryClient]);
}

function useRestoreProjectConfig() {
  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);
  const setProject = useSessionStore((s) => s.setProject);
  const projects = useProjects();
  const serverConfig = useServerConfig();

  useEffect(() => {
    if (projectId) {
      const match = projects.data?.find((p) => p.id === projectId);
      if (match && projectName !== match.name) {
        setProject({ projectId, projectName: match.name });
      }
      return;
    }
    const serverId = serverConfig.data?.project_id;
    if (!serverId) return;
    const match = projects.data?.find((p) => p.id === serverId);
    setProject({ projectId: serverId, projectName: match?.name ?? "" });
  }, [projectId, projectName, serverConfig.data?.project_id, projects.data, setProject]);
}

// ── main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const sectionOrder = useUiStore((state) => state.sidebarSectionOrder);
  const setSectionOrder = useUiStore((state) => state.setSidebarSectionOrder);

  const taigaToken = useSessionStore((state) => state.taigaToken);
  const projectId = useSessionStore((state) => state.projectId);

  useRestoreSession();
  useRestoreProjectConfig();

  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const aiConfig = useAiConfig();
  const serverConfig = useServerConfig();
  const pmWebUrl = serverConfig.data?.pm_web_url ?? serverConfig.data?.taiga_web_url ?? "https://tree.taiga.io";
  const dark = theme === "dark";

  // Migrate stored section order when new section IDs are added
  useEffect(() => {
    const known = ["project", "board", "users", "context", "ai", "github", "resources"];
    const missing = known.filter((id) => !sectionOrder.includes(id));
    if (missing.length) setSectionOrder([...sectionOrder, ...missing]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  function reorderSections(source: string, target: string) {
    if (source === target) return;
    const next = [...sectionOrder];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source);
    setSectionOrder(next);
  }

  function clearDragPreview() {
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  }

  function endSectionDrag() {
    setDragOver(null);
    setDraggingSection(null);
    dragSourceRef.current = null;
    clearDragPreview();
  }

  function makeDragSectionProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(id); },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragSourceRef.current) reorderSections(dragSourceRef.current, id);
        endSectionDrag();
      },
      onDragEnd: endSectionDrag,
    };
  }

  function makeDragStartHandler(id: string) {
    return (e: React.DragEvent) => {
      dragSourceRef.current = id;
      setDraggingSection(id);
      e.dataTransfer.effectAllowed = "move";
      clearDragPreview();

      const preview = document.createElement("div");
      preview.textContent = SECTION_LABELS[id] ?? id;
      preview.style.position = "fixed";
      preview.style.top = "-1000px";
      preview.style.left = "-1000px";
      preview.style.width = `${Math.max(220, sidebarWidth - 32)}px`;
      preview.style.height = "48px";
      preview.style.display = "flex";
      preview.style.alignItems = "center";
      preview.style.padding = "0 16px";
      preview.style.borderRadius = "8px";
      preview.style.border = "1px solid rgba(139, 92, 246, 0.75)";
      preview.style.background = dark ? "#1f1f21" : "#ffffff";
      preview.style.color = dark ? "#f5f5f5" : "#0f172a";
      preview.style.boxShadow = "0 18px 40px rgba(15, 23, 42, 0.28)";
      preview.style.font = "600 14px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      preview.style.pointerEvents = "none";
      document.body.appendChild(preview);
      dragPreviewRef.current = preview;
      e.dataTransfer.setDragImage(preview, 20, 24);
    };
  }

  function sectionShellClass(id: string, isOver: boolean) {
    return cn(
      "relative transition-all duration-150",
      draggingSection === id && "opacity-40",
      isOver && draggingSection !== id && "z-10 scale-[1.01] bg-violet-500/10 shadow-[0_0_0_2px_rgba(139,92,246,0.65)]",
    );
  }

  function startSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(event: PointerEvent) {
      const delta = event.clientX - resizeStartXRef.current;
      setSidebarWidth(resizeStartWidthRef.current + delta);
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  useEffect(() => () => clearDragPreview(), []);

  if (sidebarCollapsed) {
    return (
      <aside className={cn("sticky top-0 h-screen w-12 shrink-0 border-r", dark ? "border-neutral-700 bg-[#121113]" : "border-slate-300 bg-[#e8edf8]")}>
        <button className="grid size-12 place-items-center text-violet-400" onClick={() => setSidebarCollapsed(false)}>
          <PanelLeftOpen className="size-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "apex-sidebar relative z-20 sticky top-0 h-screen shrink-0 overflow-visible border-r text-neutral-100",
        dark ? "border-neutral-700 bg-[#121113]" : "apex-sidebar-light border-slate-300 bg-[#e8edf8]",
      )}
      style={{ width: sidebarWidth }}
    >
      <div
        className="group absolute right-0 top-0 z-50 flex h-full w-4 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
        onPointerDown={startSidebarResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      >
        <div className="h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-violet-500/60" />
      </div>

      {typeof document !== "undefined" ? createPortal(
        <ConfirmDialog
          open={Boolean(confirmState)}
          message={confirmState?.message ?? ""}
          onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
          onCancel={() => setConfirmState(null)}
        />,
        document.body,
      ) : null}

      <div className="h-full overflow-y-auto">
        <header className="flex h-[58px] items-center border-b border-neutral-800 px-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-1">
            <span className="text-2xl font-bold text-violet-400">Apex</span>
            <span className="truncate text-sm text-neutral-500">· Spec-Anchored</span>
          </div>
          <button onClick={toggleTheme} className="mr-2 grid size-8 place-items-center rounded text-white hover:bg-neutral-800" aria-label="Toggle theme">
            {dark ? <Moon className="size-5" /> : <Sun className="size-5 text-slate-800" />}
          </button>
          <button className="grid size-8 place-items-center rounded text-neutral-300 hover:bg-neutral-800" onClick={() => setSidebarCollapsed(true)}>
            <span className="text-xl leading-none">↤</span>
          </button>
        </header>

        {/* ── Account ── */}
        <section className="border-b border-neutral-800 px-4 py-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 font-mono text-xs text-violet-400">
              {aiConfig.data?.model ?? "claude-sonnet-4-6"}
            </span>
          </div>
          <LoginSection pmWebUrl={pmWebUrl} />
        </section>

        {/* ── Draggable sections ── */}
        {sectionOrder.map((id) => {
          const isOver = dragOver === id;
          const shellClass = sectionShellClass(id, isOver);
          const dragHandlers = makeDragSectionProps(id);
          const onDragStart = makeDragStartHandler(id);

          if (id !== "ai" && id !== "resources" && id !== "about" && id !== "github" && !taigaToken) return null;


          if (id === "project") {
            return (
              <ProjectSection
                key="project"
                dark={dark}
                confirm={confirm}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "board" && projectId) {
            return (
              <BoardSection
                key="board"
                dark={dark}
                projectId={projectId}
                confirm={confirm}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "users" && projectId) {
            return (
              <UsersSection
                key="users"
                dark={dark}
                projectId={projectId}
                confirm={confirm}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "context" && projectId) {
            return (
              <ContextSection
                key="context"
                dark={dark}
                projectId={projectId}
                confirm={confirm}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "ai") {
            return (
              <AiSection
                key="ai"
                dark={dark}
                taigaToken={taigaToken ?? ""}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "resources") {
            return (
              <ResourcesSection
                key="resources"
                dark={dark}
                pmWebUrl={pmWebUrl}
                pmTool={serverConfig.data?.pm_tool === "jira" ? "jira" : "taiga"}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "github") {
            return (
              <GitHubSection
                key="github"
                dark={dark}
                githubRepo={serverConfig.data?.github_repo ?? ""}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "tasks") {
            return (
              <TasksSection
                key="tasks"
                dark={dark}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "packs" && projectId) {
            return (
              <PacksSection
                key="packs"
                dark={dark}
                confirm={confirm}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          if (id === "about") {
            return (
              <AboutSection
                key="about"
                dark={dark}
                shellClass={shellClass}
                dragHandlers={dragHandlers}
                onDragStart={onDragStart}
              />
            );
          }

          return null;
        })}
        {!taigaToken ? (
          <section className="px-4 py-5">
            <p className="text-sm leading-6 text-neutral-500">
              Sign in and select a project to view board, users, and context files.
            </p>
          </section>
        ) : null}

      </div>
    </aside>
  );
}
