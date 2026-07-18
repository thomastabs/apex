"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Command, FileText, Layers3, ListChecks, Moon, RefreshCw, Sun } from "lucide-react";
import { toast } from "sonner";
import { useBoard, useContextFiles, useProjectTasks, useRebuildStoryIndex } from "@/lib/hooks/use-workspace";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

type CmdGroup = "commands" | "epics" | "stories" | "tasks" | "files";

const GROUP_LABEL_KEYS: Record<CmdGroup, TranslationKey> = {
  commands: "palette.group.commands", epics: "palette.group.epics", stories: "palette.group.stories",
  tasks: "palette.group.tasks", files: "palette.group.files",
};

type CmdItem = {
  id: string;
  label: string;
  sublabel?: string;
  keywords: string;
  icon: React.ReactNode;
  group: CmdGroup;
  action: () => void;
};

const MAX_RESULTS_PER_GROUP = 6;

function useCommands() {
  const t = useT();
  const locale = useUiStore((s) => s.locale);
  const router = useRouter();
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);
  const rebuildIndex = useRebuildStoryIndex();

  return useMemo<CmdItem[]>(() => [
    { id: "home",   label: t("palette.cmd.home"),   keywords: "home dashboard",  icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/") },
    { id: "phase1", label: t("palette.cmd.phase1"), keywords: "phase1 requirements gherkin stories epics", icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase1") },
    { id: "phase2", label: t("palette.cmd.phase2"), keywords: "phase2 design tech stack architecture",   icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase2") },
    { id: "phase3", label: t("palette.cmd.phase3"), keywords: "phase3 implementation code",           icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase3") },
    { id: "phase4", label: t("palette.cmd.phase4"), keywords: "phase4 testing qa bdd",                  icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase4") },
    { id: "phase5", label: t("palette.cmd.phase5"), keywords: "phase5 deployment deploy",               icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase5") },
    { id: "phase6", label: t("palette.cmd.phase6"), keywords: "phase6 maintenance traceability conformance spec code", icon: <Command className="size-3.5" />, group: "commands", action: () => router.push("/phase6") },
    {
      id: "theme",
      label: theme === "dark" ? t("palette.cmd.themeLight") : t("palette.cmd.themeDark"),
      keywords: "theme dark light mode toggle",
      icon: theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />,
      group: "commands",
      action: toggleTheme,
    },
    {
      id: "rebuild",
      label: t("palette.cmd.rebuildIndex"),
      keywords: "rebuild index story sync",
      icon: <RefreshCw className="size-3.5" />,
      group: "commands",
      action: () => rebuildIndex.mutate(undefined, {
        onSuccess: () => toast.success("Story index rebuilt"),
        onError:   () => toast.error("Failed to rebuild story index"),
      }),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [theme, locale]);
}

// Epics/stories/context files/PM tasks — searched by title/subject/content,
// only surfaced once the user types (kept out of the default empty-query
// command list). Selecting a result doesn't navigate; it sets a one-shot
// SearchFocus that the right-sidebar section owning that item's kind
// (board-section.tsx, context-section.tsx, tasks-section.tsx) consumes to
// expand itself and open the matching dialog — see ui-store.ts.
function useSearchResults(query: string): CmdItem[] {
  const setSearchFocus = useUiStore((s) => s.setSearchFocus);
  const setRightSidebarCollapsed = useUiStore((s) => s.setRightSidebarCollapsed);
  const board = useBoard();
  const tasks = useProjectTasks();
  const files = useContextFiles();

  function reveal(focus: Parameters<typeof setSearchFocus>[0]) {
    setRightSidebarCollapsed(false);
    setSearchFocus(focus);
  }

  return useMemo<CmdItem[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const epicItems: CmdItem[] = [];
    const storyItems: CmdItem[] = [];
    for (const epic of board.data ?? []) {
      if (epic.subject.toLowerCase().includes(q) || epic.description?.toLowerCase().includes(q) || `#${epic.ref}`.includes(q)) {
        epicItems.push({
          id: `epic-${epic.id}`, label: epic.subject, sublabel: `#${epic.ref}`,
          keywords: epic.subject.toLowerCase(), icon: <Layers3 className="size-3.5" />, group: "epics",
          action: () => reveal({ kind: "epic", id: epic.id }),
        });
      }
      for (const story of epic.stories) {
        if (story.subject.toLowerCase().includes(q) || story.description?.toLowerCase().includes(q) || `#${story.ref}`.includes(q)) {
          storyItems.push({
            id: `story-${story.id}`, label: story.subject, sublabel: `#${story.ref} · ${epic.subject}`,
            keywords: story.subject.toLowerCase(), icon: <Layers3 className="size-3.5" />, group: "stories",
            action: () => reveal({ kind: "story", id: story.id }),
          });
        }
      }
    }

    const taskItems: CmdItem[] = (tasks.data ?? [])
      .filter((t) => t.subject.toLowerCase().includes(q) || `#${t.ref}`.includes(q))
      .map((t) => ({
        id: `task-${t.id}`, label: t.subject, sublabel: `#${t.ref} · ${t.user_story_subject}`,
        keywords: t.subject.toLowerCase(), icon: <ListChecks className="size-3.5" />, group: "tasks" as const,
        action: () => reveal({ kind: "task", id: t.id }),
      }));

    const fileItems: CmdItem[] = (files.data?.files ?? [])
      .filter((f) => f.label.toLowerCase().includes(q) || f.filename.toLowerCase().includes(q) || f.content.toLowerCase().includes(q))
      .map((f) => ({
        id: `file-${f.filename}`, label: f.label, sublabel: f.filename,
        keywords: f.label.toLowerCase(), icon: <FileText className="size-3.5" />, group: "files" as const,
        action: () => reveal({ kind: "file", filename: f.filename }),
      }));

    return [
      ...epicItems.slice(0, MAX_RESULTS_PER_GROUP),
      ...storyItems.slice(0, MAX_RESULTS_PER_GROUP),
      ...taskItems.slice(0, MAX_RESULTS_PER_GROUP),
      ...fileItems.slice(0, MAX_RESULTS_PER_GROUP),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, board.data, tasks.data, files.data]);
}

export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dark = useUiStore((s) => s.theme) === "dark";
  const commands = useCommands();
  const searchResults = useSearchResults(query);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const cmdMatches = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q))
      : commands;
    return [...cmdMatches, ...searchResults];
  }, [query, commands, searchResults]);

  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
        setQuery("");
        setActiveIdx(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  function close() { setOpen(false); setQuery(""); }

  function run(item: CmdItem) {
    item.action();
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      const item = filtered[activeIdx];
      if (item) run(item);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={close}
    >
      <div
        className={cn(
          "w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl",
          dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={cn("flex items-center gap-2 border-b px-4", dark ? "border-neutral-700" : "border-slate-200")}>
          <Command className={cn("size-4 shrink-0", dark ? "text-neutral-500" : "text-slate-400")} />
          <input
            ref={inputRef}
            className={cn(
              "h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500",
              dark ? "text-white" : "text-slate-950",
            )}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
          />
          <kbd className={cn("rounded border px-1.5 py-0.5 font-mono text-xs", dark ? "border-neutral-600 text-neutral-500" : "border-slate-300 text-slate-400")}>
            esc
          </kbd>
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className={cn("px-4 py-8 text-center text-sm", dark ? "text-neutral-500" : "text-slate-400")}>
              {t("palette.noResults")}
            </div>
          ) : (
            filtered.map((item, i) => {
              const prevGroup = i > 0 ? filtered[i - 1].group : null;
              const showHeader = item.group !== prevGroup;
              return (
                <div key={item.id}>
                  {showHeader ? (
                    <div className={cn("px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-widest", dark ? "text-neutral-600" : "text-slate-400")}>
                      {t(GROUP_LABEL_KEYS[item.group])}
                    </div>
                  ) : null}
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                      i === activeIdx
                        ? dark ? "bg-violet-600/30 text-violet-200" : "bg-violet-50 text-violet-900"
                        : dark ? "text-neutral-300 hover:bg-neutral-800" : "text-slate-700 hover:bg-slate-50",
                    )}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => run(item)}
                  >
                    <span className={cn("shrink-0", dark ? "text-neutral-400" : "text-slate-400")}>{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.sublabel ? (
                      <span className={cn("shrink-0 truncate font-mono text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                        {item.sublabel}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className={cn("border-t px-4 py-2 text-xs", dark ? "border-neutral-800 text-neutral-600" : "border-slate-200 text-slate-400")}>
          <span className="mr-3"><kbd className="font-mono">↑↓</kbd> {t("palette.navigate")}</span>
          <span className="mr-3"><kbd className="font-mono">↵</kbd> {t("palette.run")}</span>
          <span><kbd className="font-mono">esc</kbd> {t("palette.close")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
