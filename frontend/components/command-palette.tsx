"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Command, Moon, RefreshCw, Sun } from "lucide-react";
import { toast } from "sonner";
import { useRebuildStoryIndex } from "@/lib/hooks/use-workspace";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

type CmdItem = {
  id: string;
  label: string;
  keywords: string;
  icon: React.ReactNode;
  action: () => void;
};

function useCommands() {
  const router = useRouter();
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);
  const rebuildIndex = useRebuildStoryIndex();

  return useMemo<CmdItem[]>(() => [
    { id: "home",   label: "Go to Home",    keywords: "home dashboard",  icon: <Command className="size-3.5" />, action: () => router.push("/") },
    { id: "phase1", label: "Go to Phase 1 — Requirements", keywords: "phase1 requirements gherkin stories epics", icon: <Command className="size-3.5" />, action: () => router.push("/phase1") },
    { id: "phase2", label: "Go to Phase 2 — Design",       keywords: "phase2 design tech stack architecture",   icon: <Command className="size-3.5" />, action: () => router.push("/phase2") },
    { id: "phase3", label: "Go to Phase 3 — Implementation", keywords: "phase3 implementation code",           icon: <Command className="size-3.5" />, action: () => router.push("/phase3") },
    { id: "phase4", label: "Go to Phase 4 — Testing",      keywords: "phase4 testing qa bdd",                  icon: <Command className="size-3.5" />, action: () => router.push("/phase4") },
    { id: "phase5", label: "Go to Phase 5 — Deployment",   keywords: "phase5 deployment deploy",               icon: <Command className="size-3.5" />, action: () => router.push("/phase5") },
    { id: "phase6", label: "Go to Phase 6 — Traceability", keywords: "phase6 maintenance traceability conformance spec code", icon: <Command className="size-3.5" />, action: () => router.push("/phase6") },
    {
      id: "theme",
      label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
      keywords: "theme dark light mode toggle",
      icon: theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />,
      action: toggleTheme,
    },
    {
      id: "rebuild",
      label: "Rebuild Story Index",
      keywords: "rebuild index story sync",
      icon: <RefreshCw className="size-3.5" />,
      action: () => rebuildIndex.mutate(undefined, {
        onSuccess: () => toast.success("Story index rebuilt"),
        onError:   () => toast.error("Failed to rebuild story index"),
      }),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [theme]);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dark = useUiStore((s) => s.theme) === "dark";
  const commands = useCommands();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [query, commands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIdx(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
          />
          <kbd className={cn("rounded border px-1.5 py-0.5 font-mono text-xs", dark ? "border-neutral-600 text-neutral-500" : "border-slate-300 text-slate-400")}>
            esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className={cn("px-4 py-8 text-center text-sm", dark ? "text-neutral-500" : "text-slate-400")}>
              No commands found
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
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
                {item.label}
              </button>
            ))
          )}
        </div>
        <div className={cn("border-t px-4 py-2 text-xs", dark ? "border-neutral-800 text-neutral-600" : "border-slate-200 text-slate-400")}>
          <span className="mr-3"><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="mr-3"><kbd className="font-mono">↵</kbd> run</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
