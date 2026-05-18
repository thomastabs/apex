"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Info,
  Layers3,
  Moon,
  PanelLeftOpen,
  RefreshCw,
  Send,
  Sun,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import {
  useBoard,
  useContextFiles,
  useCreateEpic,
  useCreateProject,
  useCreateStory,
  useDeleteEpic,
  useDeleteProject,
  useDeleteStory,
  useInviteUser,
  useLogin,
  useMe,
  useProjects,
  useResetContextFile,
  useUpdateContextFile,
  useUsers,
} from "@/lib/hooks/use-workspace";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "TO";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-violet-300">
      {children}
    </h2>
  );
}

function PanelHeader({
  icon,
  title,
  badge,
  open,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-10 w-full items-center gap-2 border-b border-neutral-800 px-4 text-left"
      onClick={onClick}
    >
      {open ? <ChevronDown className="size-3 text-neutral-500" /> : <ChevronRight className="size-3 text-neutral-500" />}
      <span className="text-violet-400">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-neutral-100">{title}</span>
      {badge ? <span className="rounded border border-neutral-600 px-1.5 py-0.5 text-xs text-neutral-300">{badge}</span> : null}
    </button>
  );
}

function SwitchAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const projectId = useSessionStore((state) => state.projectId);
  const projectName = useSessionStore((state) => state.projectName);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const login = useLogin();
  const [mode, setMode] = useState<"password" | "token">("token");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState(taigaToken);
  const [projectIdInput, setProjectIdInput] = useState(projectId ? String(projectId) : "");
  const [projectNameInput, setProjectNameInput] = useState(projectName);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80">
      <div className="w-[420px] rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h3 className="mb-4 text-xl font-bold text-white">Switch Account</h3>
        <div className="mb-4 grid grid-cols-2 rounded-md bg-neutral-800 p-1">
          <button
            className={cn("h-10 rounded text-sm text-neutral-300", mode === "password" && "bg-violet-600 text-white")}
            onClick={() => setMode("password")}
          >
            Username / Password
          </button>
          <button
            className={cn("h-10 rounded text-sm text-neutral-300", mode === "token" && "bg-violet-600 text-white")}
            onClick={() => setMode("token")}
          >
            Auth Token
          </button>
        </div>
        <div className="space-y-3">
          {mode === "password" ? (
            <>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-10 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
                placeholder="Username"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
                placeholder="Password"
              />
            </>
          ) : (
            <input
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              className="h-10 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
              placeholder="Taiga auth token"
            />
          )}
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <input
              value={projectIdInput}
              onChange={(event) => setProjectIdInput(event.target.value)}
              className="h-10 rounded border border-neutral-600 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              placeholder="Project ID"
            />
            <input
              value={projectNameInput}
              onChange={(event) => setProjectNameInput(event.target.value)}
              className="h-10 rounded border border-neutral-600 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              placeholder="Project name"
            />
          </div>
          <button
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600"
            onClick={() => {
              const nextProjectId = Number(projectIdInput);
              if (!Number.isFinite(nextProjectId) || nextProjectId <= 0) return;
              if (mode === "password") {
                login.mutate(
                  { username, password },
                  {
                    onSuccess: (data) => {
                      setSession({
                        taigaToken: data.auth_token,
                        projectId: nextProjectId,
                        projectName: projectNameInput.trim() || `Project ${nextProjectId}`,
                      });
                      onClose();
                    },
                  },
                );
                return;
              }
              if (tokenInput.trim()) {
                setSession({
                  taigaToken: tokenInput.trim(),
                  projectId: nextProjectId,
                  projectName: projectNameInput.trim() || `Project ${nextProjectId}`,
                });
                onClose();
              }
            }}
          >
            <Send className="size-4" />
            Sign in
          </button>
          <button
            className="h-9 w-full rounded bg-neutral-800 text-sm text-neutral-300 hover:bg-neutral-700"
            onClick={() => {
              clearSession();
              onClose();
            }}
          >
            Clear session
          </button>
        </div>
      </div>
    </div>
  );
}

function ContextEditor({ file }: { file: { filename: string; content: string } }) {
  const [value, setValue] = useState(file.content);
  const update = useUpdateContextFile();
  const reset = useResetContextFile();

  useEffect(() => {
    setValue(file.content);
  }, [file.content]);

  return (
    <div className="border-t border-neutral-800">
      <textarea
        className="h-56 w-full resize-y bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-200 outline-none"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2 p-2">
        <button
          className="h-8 rounded bg-violet-700 text-sm font-semibold text-white disabled:opacity-50"
          disabled={update.isPending}
          onClick={() => update.mutate({ filename: file.filename, content: value })}
        >
          Save
        </button>
        <button
          className="h-8 rounded bg-red-950/70 text-sm font-semibold text-red-300 disabled:opacity-50"
          disabled={reset.isPending}
          onClick={() => reset.mutate(file.filename)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const [accountOpen, setAccountOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [expandedEpic, setExpandedEpic] = useState<number | null>(null);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [inviteValue, setInviteValue] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newEpicSubject, setNewEpicSubject] = useState("");
  const [newStorySubject, setNewStorySubject] = useState("");

  const taigaToken = useSessionStore((state) => state.taigaToken);
  const projectId = useSessionStore((state) => state.projectId);
  const projectName = useSessionStore((state) => state.projectName);
  const setProject = useSessionStore((state) => state.setProject);

  const me = useMe();
  const projects = useProjects();
  const contextFiles = useContextFiles();
  const board = useBoard();
  const users = useUsers();
  const invite = useInviteUser();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const createEpic = useCreateEpic();
  const deleteEpic = useDeleteEpic();
  const createStory = useCreateStory();
  const deleteStory = useDeleteStory();

  const displayName = me.data?.full_name || me.data?.username || (taigaToken ? "Taiga User" : "Not signed in");
  const email = me.data?.email || (taigaToken ? "Token configured" : "Sign in to Taiga using the ⇄ button →");
  const activeProjectName = projectName || (projectId ? `Project ${projectId}` : "No project selected");
  const totalChars = contextFiles.data?.total_chars ?? 0;
  const memberCount = users.data?.memberships.length ?? 0;
  const epicCount = board.data?.length ?? 0;
  const defaultRoleId = roleId ?? users.data?.roles[0]?.id ?? 0;

  const projectOptions = useMemo(() => projects.data ?? [], [projects.data]);
  const dark = theme === "dark";

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (event.buttons !== 1) return;
      setSidebarWidth(event.clientX);
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    function onDown(event: MouseEvent) {
      event.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    const handle = document.getElementById("apex-sidebar-resizer");
    handle?.addEventListener("mousedown", onDown);
    return () => {
      handle?.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setSidebarWidth]);

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
        "apex-sidebar relative sticky top-0 h-screen shrink-0 overflow-y-auto border-r text-neutral-100",
        dark ? "border-neutral-700 bg-[#121113]" : "apex-sidebar-light border-slate-300 bg-[#e8edf8]",
      )}
      style={{ width: sidebarWidth }}
    >
      <div id="apex-sidebar-resizer" className="absolute right-0 top-0 z-40 h-full w-1 cursor-col-resize" />
      <SwitchAccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
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

      <section className="border-b border-neutral-800 px-4 py-5">
        <SectionTitle>Settings & Connections</SectionTitle>
        <div className="mb-4 flex gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950 px-2 py-1 text-xs font-medium text-emerald-300">
            <Zap className="size-3" />
            Anthropic
          </span>
          <span className="rounded bg-indigo-950 px-2 py-1 font-mono text-xs text-indigo-200">
            claude-sonnet-4-6
          </span>
        </div>

        {!taigaToken ? (
          <div className="mb-3 rounded border-l-4 border-violet-400 bg-violet-950/60 p-3 text-sm text-violet-100">
            Use the ⇄ button to sign in to Taiga.
          </div>
        ) : null}

        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded bg-violet-950 text-xs font-bold text-violet-300">
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{displayName}</div>
            <div className="truncate text-xs text-neutral-500">{email}</div>
          </div>
          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
            onClick={() => setAccountOpen(true)}
          >
            ⇄ Switch Account
          </button>
        </div>

        {taigaToken ? (
          <div className="space-y-4">
            <div className="resize-y overflow-auto rounded-md border border-neutral-800 bg-[#181719]">
              <PanelHeader
                icon={<FolderOpen className="size-4" />}
                title={activeProjectName}
                open={projectOpen}
                onClick={() => setProjectOpen(!projectOpen)}
              />
              {projectOpen ? (
                <div className="space-y-2 p-3">
                  <select
                    className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                    value={projectId ?? ""}
                    onChange={(event) => {
                      const selected = projectOptions.find((project) => project.id === Number(event.target.value));
                      if (selected) setProject({ projectId: selected.id, projectName: selected.name });
                    }}
                  >
                    <option value="">{projects.isLoading ? "Loading projects..." : "Select project"}</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="h-8 rounded bg-neutral-800 text-sm text-neutral-300 hover:bg-neutral-700"
                      onClick={() => projects.refetch()}
                    >
                      ↻ Refresh
                    </button>
                    <button
                      className="h-8 rounded bg-violet-800 text-sm font-semibold text-violet-100"
                      onClick={() => {
                        const name = window.prompt("Project name", newProjectName);
                        if (name?.trim()) createProject.mutate({ name: name.trim(), description: "" });
                      }}
                    >
                      + Create New
                    </button>
                  </div>
                  <button
                    className="h-8 w-full rounded bg-red-950/70 text-sm font-semibold text-red-300 disabled:opacity-50"
                    disabled={!projectId || deleteProject.isPending}
                    onClick={() => {
                      if (projectId && window.confirm("Delete this Taiga project?")) deleteProject.mutate(projectId);
                    }}
                  >
                    <Trash2 className="mr-1 inline size-3" />
                    Delete Project
                  </button>
                </div>
              ) : null}
            </div>

            <div className="resize-y overflow-auto rounded-md border border-neutral-800 bg-[#181719]">
              <PanelHeader
                icon={<Layers3 className="size-4" />}
                title="Epics & Stories"
                open={boardOpen}
                onClick={() => setBoardOpen(!boardOpen)}
              />
              {boardOpen ? (
                <div className="space-y-3 p-3 text-sm">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>{epicCount} epic(s)</span>
                    <div className="flex gap-2">
                      <button
                        className="rounded bg-violet-800 px-3 py-2 font-semibold text-violet-100"
                        onClick={() => {
                          const subject = window.prompt("Epic title", newEpicSubject);
                          if (subject?.trim()) createEpic.mutate({ subject: subject.trim(), description: "" });
                        }}
                      >
                        + Create New Epic
                      </button>
                      <button className="rounded bg-neutral-800 px-3 py-2 text-neutral-300" onClick={() => board.refetch()}>
                        ↻ Refresh
                      </button>
                    </div>
                  </div>
                  {board.data?.length ? (
                    board.data.map((epic) => (
                      <div key={epic.id}>
                        <button
                          className="flex w-full items-center gap-2 text-left font-semibold text-white"
                          onClick={() => setExpandedEpic(expandedEpic === epic.id ? null : epic.id)}
                        >
                          {expandedEpic === epic.id ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                          #{epic.ref} {epic.subject}
                          <Trash2
                            className="ml-auto size-3 text-red-400"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (window.confirm("Delete this epic and its stories?")) deleteEpic.mutate(epic.id);
                            }}
                          />
                        </button>
                        {expandedEpic === epic.id ? (
                          <div className="mt-2 space-y-2 pl-6 text-neutral-300">
                            <button
                              className="rounded bg-violet-900 px-2 py-1 text-xs font-semibold text-violet-100"
                              onClick={() => {
                                const subject = window.prompt("Story title", newStorySubject);
                                if (subject?.trim()) createStory.mutate({ epicId: epic.id, subject: subject.trim(), description: "" });
                              }}
                            >
                              + Create Story
                            </button>
                            {epic.stories.map((story) => (
                              <div key={story.id} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate">#{story.ref} {story.subject}</span>
                                <Info className="size-3 text-violet-300" />
                                <Trash2
                                  className="size-3 cursor-pointer text-red-400"
                                  onClick={() => {
                                    if (window.confirm("Delete this story?")) deleteStory.mutate(story.id);
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-neutral-500">No epics yet.</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="resize-y overflow-auto rounded-md border border-neutral-800 bg-[#181719]">
              <PanelHeader
                icon={<Users className="size-4" />}
                title="Users & Roles"
                badge={`${memberCount} members`}
                open={usersOpen}
                onClick={() => setUsersOpen(!usersOpen)}
              />
              {usersOpen ? (
                <div className="space-y-3 p-3 text-sm">
                  {users.data?.memberships.map((member) => (
                    <div key={member.id} className="border-b border-neutral-700 pb-3">
                      <div className="font-semibold text-white">{member.full_name || member.username || member.email}</div>
                      <div className="text-xs text-neutral-500">{member.email}</div>
                      <span className="mt-1 inline-block rounded border border-violet-600 px-2 py-0.5 text-xs text-violet-200">
                        {member.role_name || "Member"}
                      </span>
                    </div>
                  ))}
                  <div className="space-y-2">
                    <div className="font-semibold text-white">Invite member</div>
                    <input
                      value={inviteValue}
                      onChange={(event) => setInviteValue(event.target.value)}
                      className="h-8 w-full rounded border border-violet-700 bg-neutral-950 px-2 text-sm text-white"
                      placeholder="Username or email"
                    />
                    <select
                      value={defaultRoleId}
                      onChange={(event) => setRoleId(Number(event.target.value))}
                      className="h-8 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                    >
                      <option value={0}>Role</option>
                      {users.data?.roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <button
                      className="h-8 w-full rounded bg-violet-600 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={!inviteValue.trim() || !defaultRoleId || invite.isPending}
                      onClick={() => invite.mutate({ usernameOrEmail: inviteValue, roleId: defaultRoleId })}
                    >
                      Send invite
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="px-4 py-7">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>Active Context</SectionTitle>
          <button onClick={() => contextFiles.refetch()}><RefreshCw className="size-4 text-neutral-400" /></button>
        </div>
        {!taigaToken || !projectId ? (
          <p className="text-sm leading-6 text-neutral-500">
            Sign in and select a project to view and edit the Memory Bank, Functional Spec, and other context files that anchor AI across the SDLC.
          </p>
        ) : (
          <>
            <div className="mb-3 text-sm text-neutral-500">
              context: <span className="font-bold text-red-400">{totalChars} chars</span>
            </div>
            <div className="space-y-3">
              {contextFiles.data?.files.map((file) => (
                <div key={file.filename} className="rounded-md border border-neutral-800 bg-[#181719]">
                  <button
                    className="flex h-10 w-full items-center gap-3 px-4 text-left"
                    onClick={() => setExpandedContext(expandedContext === file.filename ? null : file.filename)}
                  >
                    <ChevronRight className={cn("size-3 text-neutral-500", expandedContext === file.filename && "rotate-90")} />
                    <FileText className="size-4 text-violet-400" />
                    <span className="flex-1 text-sm font-medium text-white">{file.label}</span>
                    <span className="text-xs text-neutral-500">{file.chars} ch</span>
                  </button>
                  {expandedContext === file.filename ? <ContextEditor file={file} /> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}
