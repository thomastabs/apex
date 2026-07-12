"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BarChart3, Bot, CheckCircle2, Code2, Compass, Eye, EyeOff,
  ExternalLink, FileText, Home, Moon, Network, PanelLeftOpen,
  Rocket, Send, Settings, Sun, UserPlus, Wrench, Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAiConfig, useMe, useProjects, useServerConfig, useStoryIndexStats,
} from "@/lib/hooks/use-workspace";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { usePhase4Store } from "@/lib/stores/phase4-store";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError, apiRequest, getApiBaseUrl } from "@/lib/api/client";
import { clearJiraProjectTypeCache } from "@/lib/api/jira-adapter";
import { AiSection } from "./sidebar/ai-section";
import { UsageSection } from "./sidebar/usage-section";
import { ResourcesSection } from "./sidebar/resources-section";
import { GitHubSection, GithubAutoSync } from "./sidebar/github-section";
import { FigmaSection, FigmaAutoRestore } from "./sidebar/figma-section";
import { AboutSection } from "./sidebar/about-section";
import { AdminSection } from "./sidebar/admin-section";

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "??";
  return clean.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function phaseBadge(
  stats: ReturnType<typeof useStoryIndexStats>["data"],
  phase: number,
): string | undefined {
  if (!stats || stats.total === 0) return undefined;
  const t = stats.total;
  if (phase === 1) return `${t}`;
  if (phase === 2 && stats.phase2_designed > 0) return `${stats.phase2_designed}/${t}`;
  if (phase === 3 && stats.phase3_proposed > 0) return `${stats.phase3_proposed}/${t}`;
  if (phase === 4 && stats.phase4_tested > 0) return `${stats.phase4_tested}/${t}`;
  if (phase === 5 && stats.phase5_deployed > 0) return `${stats.phase5_deployed}/${t}`;
  return undefined;
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({
  href, icon: Icon, label, badge, active, dark, muted,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  active: boolean;
  dark: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={muted ? "#" : href}
      onClick={muted ? (e) => e.preventDefault() : undefined}
      className={cn(
        "flex h-9 items-center gap-3 border-l-2 px-4 text-sm transition-colors",
        active
          ? cn(
              "border-violet-500 font-medium",
              dark ? "bg-violet-500/10 text-neutral-100" : "bg-violet-50 text-slate-900",
            )
          : muted
            ? cn("border-transparent cursor-default", dark ? "text-neutral-700" : "text-slate-300")
            : cn(
                "border-transparent",
                dark
                  ? "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
              ),
      )}
    >
      <Icon className={cn(
        "size-4 shrink-0",
        active
          ? "text-violet-400"
          : muted
            ? dark ? "text-neutral-700" : "text-slate-300"
            : dark ? "text-neutral-500" : "text-slate-400",
      )} />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
          active
            ? dark ? "bg-violet-900/60 text-violet-300" : "bg-violet-100 text-violet-600"
            : dark ? "bg-neutral-800 text-neutral-500" : "bg-slate-100 text-slate-400",
        )}>
          {badge}
        </span>
      )}
    </Link>
  );
}

// ── NavDivider ────────────────────────────────────────────────────────────────

function NavDivider({ label, dark }: { label: string; dark: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className={cn("text-[10px] font-semibold uppercase tracking-widest", dark ? "text-neutral-600" : "text-slate-400")}>
        {label}
      </span>
      <div className={cn("h-px flex-1", dark ? "bg-neutral-800" : "bg-slate-200")} />
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────

function SettingsModal({
  open, onClose, dark, taigaToken, serverConfig, pmWebUrl,
}: {
  open: boolean;
  onClose: () => void;
  dark: boolean;
  taigaToken: string;
  serverConfig: ReturnType<typeof useServerConfig>["data"];
  pmWebUrl: string;
}) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-12"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-lg rounded-xl border shadow-2xl",
          dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn("flex items-center justify-between border-b px-5 py-3.5", dark ? "border-neutral-800" : "border-slate-200")}>
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-violet-400" />
            <span className={cn("text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>Settings</span>
          </div>
          <button
            onClick={onClose}
            className={cn("grid size-6 place-items-center rounded text-sm transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700")}
          >
            ✕
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
          <AiSection dark={dark} taigaToken={taigaToken} />
          <UsageSection dark={dark} />
          <FigmaSection dark={dark} figmaFileKey={serverConfig?.figma_file_key ?? ""} />
          <GitHubSection dark={dark} githubRepo={serverConfig?.github_repo ?? ""} />
          <ResourcesSection
            dark={dark}
            pmWebUrl={pmWebUrl}
            pmTool={serverConfig?.pm_tool === "jira" ? "jira" : "taiga"}
          />
          <AboutSection dark={dark} />
          <AdminSection dark={dark} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── LoginSection ──────────────────────────────────────────────────────────────

function LoginSection({ pmWebUrl }: { pmWebUrl: string }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const setAuth = useSessionStore((s) => s.setAuth);
  const clearSession = useSessionStore((s) => s.clearSession);
  const taigaToken = useSessionStore((s) => s.taigaToken);
  const storedPmTool = useSessionStore((s) => s.pmTool);
  const storedTaigaApiUrl = useSessionStore((s) => s.taigaApiUrl);
  const clearPhase2Draft = usePhase2Store((s) => s.clearPhase2Draft);
  const clearPhase3Draft = usePhase3Store((s) => s.clearPhase3Draft);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();

  const signOut = () => {
    clearJiraProjectTypeCache();
    clearSession(); clearPhase2Draft(); clearPhase3Draft(); clearPhase4Draft(); clearPhase5Draft();
    queryClient.clear();
    router.push("/");
  };

  // Jira login is deactivated for now (backlog) — sign-in form is Taiga-only.
  const [pmTool] = useState<"taiga" | "jira">("taiga");
  const [mode, setMode] = useState<"password" | "token">("token");
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

  const effectiveTaigaApiUrl = taigaInstanceUrl.trim()
    ? taigaInstanceUrl.trim().replace(/\/+$/, "").replace("//tree.", "//api.").replace(/\/api\/v1$/, "")
    : pmWebUrl.includes("taiga") ? pmWebUrl.replace("//tree.", "//api.") : "https://api.taiga.io";

  async function handlePasswordLogin() {
    if (!username.trim() || !password.trim()) return;
    setIsPending(true); setLoginError("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/pm/taiga/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Taiga-Url": effectiveTaigaApiUrl },
        body: JSON.stringify({ username: username.trim(), password, type: "normal" }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setLoginError((data.detail as string) ?? (res.status === 401 ? "Invalid username or password." : `Login failed — ${res.status}.`));
        return;
      }
      const token = data.auth_token as string;
      queryClient.setQueryData(["workspace", "me"], { id: data.id, username: data.username, full_name: data.full_name, email: data.email });
      setPassword(""); setUsername("");
      await apiRequest("/api/workspace/config", { method: "POST", context: { taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" }, body: { pm_tool: "taiga", taiga_url: effectiveTaigaApiUrl, jira_base_url: "" } }).catch(() => undefined);
      setAuth({ taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" });
    } catch { setLoginError("Cannot reach Apex backend — check your network."); }
    finally { setIsPending(false); }
  }

  async function handleJiraLogin() {
    const domain = jiraDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const email = jiraEmail.trim();
    const apiToken = jiraApiToken.trim();
    if (!domain || !email || !apiToken) { setLoginError("Domain, email, and API token are required."); return; }
    setIsPending(true); setLoginError("");
    try {
      const jiraBaseUrl = `https://${domain}`;
      const encodedToken = btoa(`${email}:${apiToken}`);
      const res = await fetch(`${getApiBaseUrl()}/api/pm/jira/myself`, {
        headers: { Authorization: `Basic ${encodedToken}`, Accept: "application/json", "X-Jira-Base-Url": jiraBaseUrl },
      });
      if (!res.ok) { setLoginError(res.status === 401 || res.status === 403 ? "Authentication failed — check your credentials." : `Authentication failed — ${res.status}.`); return; }
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      queryClient.setQueryData(["workspace", "me"], { id: undefined, username: (data.emailAddress as string) || (data.displayName as string) || email, full_name: (data.displayName as string) || "", email: (data.emailAddress as string) || email });
      await apiRequest("/api/workspace/config", { method: "POST", context: { taigaToken: encodedToken, taigaApiUrl: jiraBaseUrl, pmTool: "jira" }, body: { pm_tool: "jira", jira_base_url: jiraBaseUrl } }).catch(() => undefined);
      setJiraApiToken(""); setJiraEmail("");
      setAuth({ taigaToken: encodedToken, taigaApiUrl: jiraBaseUrl, pmTool: "jira", jiraEmail: email });
    } catch { setLoginError("Cannot reach Jira — check your domain and network."); }
    finally { setIsPending(false); }
  }

  const displayName = me.data?.full_name || me.data?.username || (taigaToken ? "User" : "");
  const email = me.data?.email || "";

  // ── Signed-in card ──
  if (taigaToken) {
    const pmLabel = storedPmTool === "jira" ? "Jira Cloud" : "Taiga";
    const pmColor = storedPmTool === "jira"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
      : "border-violet-500/30 bg-violet-500/10 text-violet-400";
    return (
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className={cn("grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold", dark ? "bg-violet-950 text-violet-300" : "bg-violet-100 text-violet-700")}>
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{displayName || "User"}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("rounded border px-1 py-px text-[10px] font-semibold", pmColor)}>{pmLabel}</span>
            {email && <span className={cn("truncate text-[11px]", dark ? "text-neutral-500" : "text-slate-500")}>{email}</span>}
          </div>
          {storedPmTool === "taiga" && storedTaigaApiUrl && storedTaigaApiUrl !== "https://api.taiga.io" && (
            <div className={cn("truncate text-[10px] mt-0.5", dark ? "text-neutral-600" : "text-slate-400")}>{storedTaigaApiUrl}</div>
          )}
        </div>
        <button className={cn("shrink-0 text-[11px] transition-colors hover:text-red-400", dark ? "text-neutral-500" : "text-slate-500")} onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  // ── Sign-in form ──
  return (
    <div className="space-y-3 px-4 py-4">
      {/* Jira Cloud login deactivated for now (backlog) — Taiga-only tab bar hidden. */}

      {pmTool === "taiga" ? (
        <>
          <div className={cn("grid grid-cols-2 rounded-md p-1", dark ? "bg-neutral-800" : "bg-slate-100")}>
            <button className={cn("h-8 rounded text-xs", dark ? "text-neutral-300" : "text-slate-500", mode === "password" && (dark ? "bg-neutral-700 text-white" : "bg-white text-slate-900 shadow-sm"))} onClick={() => setMode("password")}>Password</button>
            <button className={cn("h-8 rounded text-xs", dark ? "text-neutral-300" : "text-slate-500", mode === "token" && (dark ? "bg-neutral-700 text-white" : "bg-white text-slate-900 shadow-sm"))} onClick={() => setMode("token")}>Auth Token</button>
          </div>
          <input value={taigaInstanceUrl} onChange={(e) => setTaigaInstanceUrl(e.target.value)} className={cn("h-8 w-full rounded border px-3 text-xs outline-none", dark ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-600 focus:border-violet-500/70" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-500")} placeholder="Instance URL (blank = Taiga Cloud)" autoComplete="off" />
          {mode === "password" ? (
            <>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className={cn("h-8 w-full rounded border px-3 text-xs outline-none", dark ? "border-neutral-700 bg-neutral-950 text-white focus:border-violet-500" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-500")} placeholder="Username" />
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={cn("h-8 w-full rounded border px-3 pr-8 text-xs outline-none", dark ? "border-neutral-700 bg-neutral-950 text-white focus:border-violet-500" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-500")} placeholder="Password" onKeyDown={(e) => { if (e.key === "Enter") handlePasswordLogin(); }} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className={cn("absolute inset-y-0 right-2 transition-colors", dark ? "text-neutral-500 hover:text-neutral-300" : "text-slate-400 hover:text-slate-600")} tabIndex={-1}>
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </>
          ) : (
            <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className={cn("h-8 w-full rounded border px-3 text-xs outline-none", dark ? "border-neutral-700 bg-neutral-950 text-white focus:border-violet-500" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-500")} placeholder="Taiga auth token" />
          )}
          {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          <button
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded bg-violet-700 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
            disabled={isPending}
            onClick={() => {
              if (mode === "password") { handlePasswordLogin(); }
              else if (tokenInput.trim()) {
                const token = tokenInput.trim();
                void apiRequest("/api/workspace/config", { method: "POST", context: { taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" }, body: { pm_tool: "taiga", taiga_url: effectiveTaigaApiUrl, jira_base_url: "" } }).catch(() => undefined);
                setAuth({ taigaToken: token, taigaApiUrl: effectiveTaigaApiUrl, pmTool: "taiga" });
              }
            }}
          >
            <Send className="size-3" />
            {isPending ? "Signing in..." : "Sign in to Taiga"}
          </button>
          <a href={pmWebUrl || "https://tree.taiga.io"} target="_blank" rel="noopener noreferrer" className={cn("flex items-center justify-center gap-1 text-[11px] transition-colors hover:text-violet-400", dark ? "text-neutral-500" : "text-slate-500")}>
            <UserPlus className="size-3" /> Create account
          </a>
        </>
      ) : (
        <>
          <div className="rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-300/80 space-y-0.5">
            <p className="font-semibold text-blue-300">How to connect:</p>
            <p>1. Enter your Jira site domain</p>
            <p>2. Enter your Atlassian email</p>
            <p>3. <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-200">Generate an API token</a></p>
          </div>
          <input value={jiraDomain} onChange={(e) => setJiraDomain(e.target.value)} className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-white outline-none focus:border-violet-500" placeholder="yourcompany.atlassian.net" autoComplete="off" />
          <input value={jiraEmail} onChange={(e) => setJiraEmail(e.target.value)} className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-white outline-none focus:border-violet-500" placeholder="you@example.com" autoComplete="email" />
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">API token</span>
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">Generate <ExternalLink className="size-3" /></a>
            </div>
            <input type="password" value={jiraApiToken} onChange={(e) => setJiraApiToken(e.target.value)} className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-white outline-none focus:border-violet-500" placeholder="ATATT3xFfGF0…" onKeyDown={(e) => { if (e.key === "Enter") handleJiraLogin(); }} autoComplete="off" />
          </div>
          {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          <button className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded bg-blue-700 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50" disabled={isPending} onClick={handleJiraLogin}>
            <Send className="size-3" />
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
  const clearPhase3Draft = usePhase3Store((s) => s.clearPhase3Draft);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (!taigaToken) return;
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      toast.error("Session expired — please sign in again.");
      clearSession(); clearPhase2Draft(); clearPhase3Draft(); clearPhase4Draft(); clearPhase5Draft();
      queryClient.clear();
      router.push("/");
    }
  }, [taigaToken, me.isError, me.error, clearSession, clearPhase2Draft, clearPhase3Draft, clearPhase4Draft, clearPhase5Draft, queryClient, router]);
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
      if (match && projectName !== match.name) setProject({ projectId, projectName: match.name });
      return;
    }
    const serverId = serverConfig.data?.project_id;
    if (!serverId) return;
    const match = projects.data?.find((p) => p.id === serverId);
    setProject({ projectId: serverId, projectName: match?.name ?? "" });
  }, [projectId, projectName, serverConfig.data?.project_id, projects.data, setProject]);
}

// ── main Sidebar ──────────────────────────────────────────────────────────────

const PHASE_ITEMS = [
  { href: "/phase1", icon: FileText,     label: "Requirements",   phase: 1 },
  { href: "/phase2", icon: Compass,      label: "Design",         phase: 2 },
  { href: "/phase3", icon: Code2,        label: "Implementation", phase: 3 },
  { href: "/phase4", icon: CheckCircle2, label: "Testing",        phase: 4 },
  { href: "/phase5", icon: Rocket,       label: "Deployment",     phase: 5 },
  { href: "/phase6", icon: Wrench,       label: "Maintenance",    phase: 6 },
] as const;

const TOOL_ITEMS = [
  { href: "/autopilot",    icon: Bot,      label: "Autopilot"   },
  { href: "/fix-bolt",     icon: Zap,      label: "Fix Bolt"    },
  { href: "/traceability", icon: Network,  label: "Trace Graph" },
  { href: "/analytics",    icon: BarChart3, label: "Analytics"  },
] as const;

export function Sidebar() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  const taigaToken = useSessionStore((s) => s.taigaToken);
  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);

  useRestoreSession();
  useRestoreProjectConfig();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  const serverConfig = useServerConfig();
  const { data: stats } = useStoryIndexStats();
  const pmWebUrl = serverConfig.data?.pm_web_url ?? serverConfig.data?.taiga_web_url ?? "https://tree.taiga.io";
  const dark = theme === "dark";
  const pathname = usePathname();

  function startSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    function onMove(ev: PointerEvent) { setSidebarWidth(resizeStartWidthRef.current + ev.clientX - resizeStartXRef.current); }
    function onUp() {
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // ── collapsed state ──
  if (sidebarCollapsed) {
    return (
      <aside className={cn("sticky top-0 h-screen w-12 shrink-0 border-r flex flex-col", dark ? "border-neutral-800 bg-[#111112]" : "border-slate-200 bg-[#f5f5f7]")}>
        <button className="grid size-12 shrink-0 place-items-center text-violet-400 hover:text-violet-300" onClick={() => setSidebarCollapsed(false)}>
          <PanelLeftOpen className="size-4" />
        </button>
        <div className="flex shrink-0 flex-col items-center gap-1 py-2">
          {[{ href: "/", icon: Home }, ...PHASE_ITEMS, ...TOOL_ITEMS].map(({ href, icon: Icon }) => (
            <Link key={href} href={href} className={cn("grid size-9 place-items-center rounded transition-colors", pathname === href ? "text-violet-400" : dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-300 hover:text-slate-600")}>
              <Icon className="size-4" />
            </Link>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center pb-4">
          <span className={cn("rotate-180 select-none text-xs font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl]", dark ? "text-neutral-700" : "text-slate-300")}>
            Navigation
          </span>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className={cn("grid size-9 shrink-0 place-items-center self-center mb-2 rounded transition-colors", dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-300 hover:text-slate-600")}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </button>
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          dark={dark}
          taigaToken={taigaToken ?? ""}
          serverConfig={serverConfig.data}
          pmWebUrl={pmWebUrl}
        />
        <GithubAutoSync />
        <FigmaAutoRestore />
      </aside>
    );
  }

  const sidebarBg = dark ? "bg-[#111112] border-neutral-800" : "bg-[#f5f5f7] border-slate-200";

  return (
    <aside
      className={cn("apex-sidebar relative z-20 sticky top-0 h-screen shrink-0 overflow-visible border-r flex flex-col", sidebarBg)}
      style={{ width: sidebarWidth }}
    >
      {/* Resize handle */}
      <div
        className="group absolute right-0 top-0 z-50 flex h-full w-4 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
        onPointerDown={startSidebarResize}
        role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
      >
        <div className="h-full w-px bg-transparent transition-colors group-hover:bg-violet-500/60" />
      </div>

      {/* ── Zone 1: Header ── */}
      <header className={cn("flex h-[52px] shrink-0 items-center gap-2 border-b px-4", dark ? "border-neutral-800" : "border-slate-200")}>
        <Link href="/" className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-xl font-bold text-violet-400">Apex</span>
          {projectName && (
            <span className={cn("truncate text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
              · {projectName}
            </span>
          )}
        </Link>
        <button onClick={toggleTheme} className={cn("grid size-7 shrink-0 place-items-center rounded transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700")} aria-label="Toggle theme">
          {dark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
        </button>
        <button onClick={() => setSidebarCollapsed(true)} className={cn("grid size-7 shrink-0 place-items-center rounded transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700")} aria-label="Collapse sidebar">
          <span className="text-base leading-none">↤</span>
        </button>
      </header>

      {/* ── Zone 2: Account ── */}
      <div className={cn("shrink-0 border-b", dark ? "border-neutral-800" : "border-slate-200")}>
        <LoginSection pmWebUrl={pmWebUrl} />
      </div>

      {taigaToken ? (
        <>
          {/* ── Zone 3: Navigation ── */}
          <nav className="shrink-0 py-2">
            <NavItem href="/" icon={Home} label="Home" active={pathname === "/"} dark={dark} />
            <NavDivider label="Phases" dark={dark} />
            {PHASE_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                badge={phaseBadge(stats, item.phase)}
                active={pathname === item.href || pathname.startsWith(item.href + "/")}
                dark={dark}
                muted={!projectId}
              />
            ))}
            <NavDivider label="Tools" dark={dark} />
            {TOOL_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname === item.href || pathname.startsWith(item.href + "/")}
                dark={dark}
              />
            ))}
          </nav>

          {/* ── Zone 4: spacer — context sections all live in the right-hand
               Workspace sidebar now (see right-sidebar.tsx) ── */}
          {projectId ? (
            <div className={cn("min-h-0 flex-1 border-t", dark ? "border-neutral-800" : "border-slate-200")} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className={cn("px-4 py-4 text-xs leading-5", dark ? "text-neutral-600" : "text-slate-400")}>
                Pick a project in the Workspace panel on the right to unlock the phase workflows.
              </p>
            </div>
          )}
        </>
      ) : (
        /* No nav when not signed in — login form is the focus */
        <div className="min-h-0 flex-1" />
      )}

      {/* ── Zone 5: Footer ── */}
      <div className={cn("shrink-0 border-t", dark ? "border-neutral-800" : "border-slate-200")}>
        <button
          onClick={() => setSettingsOpen(true)}
          className={cn(
            "flex h-10 w-full items-center gap-2 px-4 text-xs transition-colors",
            dark ? "text-neutral-500 hover:text-neutral-300" : "text-slate-400 hover:text-slate-600",
          )}
        >
          <Settings className="size-5" />
          <span>Settings</span>
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
        taigaToken={taigaToken ?? ""}
        serverConfig={serverConfig.data}
        pmWebUrl={pmWebUrl}
      />
      <GithubAutoSync />
      <FigmaAutoRestore />
    </aside>
  );
}
