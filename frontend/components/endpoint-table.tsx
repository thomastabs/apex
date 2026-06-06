"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Zap, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface ParsedEndpoint {
  method: HttpMethod;
  path: string;
  auth?: string;
  input?: string;
  output?: string;
}

interface EndpointGroup {
  name: string;
  endpoints: ParsedEndpoint[];
}

const METHOD_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;
const PATH_RE = /(?:^|\s)(\/[^\s·|`\n]+)/;

function parseEndpoints(markdown: string): EndpointGroup[] {
  const lines = markdown.split("\n");
  const groups: EndpointGroup[] = [];
  let current: EndpointGroup = { name: "Endpoints", endpoints: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#{1,4}\s+\S/.test(line)) {
      if (current.endpoints.length > 0) groups.push(current);
      current = { name: line.replace(/^#+\s+/, "").replace(/\*+/g, "").trim(), endpoints: [] };
      continue;
    }

    const methodMatch = line.match(METHOD_RE);
    const pathMatch = line.match(PATH_RE);
    if (!methodMatch || !pathMatch) continue;

    const method = methodMatch[1] as HttpMethod;
    const path = pathMatch[1].replace(/[*`]/g, "");

    const parts = line.split("·").map((p) => p.trim());
    const auth = parts.length > 1 ? parts[1].replace(/[*`]/g, "").trim() : undefined;

    const inMatch = line.match(/in[:\s]*\{([^}]*)\}/i);
    const outMatch = line.match(/out[:\s]*\{([^}]*)\}/i);

    current.endpoints.push({
      method,
      path,
      auth: auth && auth !== path ? auth : undefined,
      input: inMatch?.[1]?.trim(),
      output: outMatch?.[1]?.trim(),
    });
  }

  if (current.endpoints.length > 0) groups.push(current);
  return groups.filter((g) => g.endpoints.length > 0);
}

// ---------------------------------------------------------------------------
// Method badge + bar styles
// ---------------------------------------------------------------------------

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST:    "bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300",
  PUT:     "bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300",
  PATCH:   "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  DELETE:  "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300",
  HEAD:    "bg-slate-100  text-slate-600  dark:bg-neutral-800   dark:text-neutral-400",
  OPTIONS: "bg-slate-100  text-slate-600  dark:bg-neutral-800   dark:text-neutral-400",
};

const METHOD_ACTIVE_RING: Record<HttpMethod, string> = {
  GET:     "ring-2 ring-emerald-500",
  POST:    "ring-2 ring-blue-500",
  PUT:     "ring-2 ring-amber-500",
  PATCH:   "ring-2 ring-orange-500",
  DELETE:  "ring-2 ring-red-500",
  HEAD:    "ring-2 ring-slate-400",
  OPTIONS: "ring-2 ring-slate-400",
};

const METHOD_BAR_COLOR: Record<HttpMethod, string> = {
  GET:     "bg-emerald-500",
  POST:    "bg-blue-500",
  PUT:     "bg-amber-500",
  PATCH:   "bg-orange-500",
  DELETE:  "bg-red-500",
  HEAD:    "bg-slate-400",
  OPTIONS: "bg-slate-300",
};

const METHOD_ORDER: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// ---------------------------------------------------------------------------
// Field pill parser
// ---------------------------------------------------------------------------

function parseFields(raw: string): { key: string; type: string }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const colon = s.indexOf(":");
      if (colon === -1) return { key: s, type: "any" };
      return { key: s.slice(0, colon).trim(), type: s.slice(colon + 1).trim() };
    });
}

// ---------------------------------------------------------------------------
// Endpoint Table Panel
// ---------------------------------------------------------------------------

export function EndpointTable({
  endpointsContent,
  dark,
}: {
  endpointsContent: string;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<HttpMethod>>(new Set());
  const [search, setSearch] = useState("");

  const groups = parseEndpoints(endpointsContent);
  const totalCount = groups.reduce((n, g) => n + g.endpoints.length, 0);
  const hasEndpoints = totalCount > 0;

  // Method counts (across all, unfiltered)
  const methodCounts = useMemo(() => {
    const counts = new Map<HttpMethod, number>();
    for (const g of groups) {
      for (const ep of g.endpoints) {
        counts.set(ep.method, (counts.get(ep.method) ?? 0) + 1);
      }
    }
    return counts;
  }, [groups]);

  const activeMethods = METHOD_ORDER.filter((m) => (methodCounts.get(m) ?? 0) > 0);

  // Filtered groups (method filter + search)
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter((ep) => {
          const methodOk = activeFilters.size === 0 || activeFilters.has(ep.method);
          const searchOk = !q || ep.path.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q);
          return methodOk && searchOk;
        }),
      }))
      .filter((g) => g.endpoints.length > 0);
  }, [groups, activeFilters, search]);

  const filteredCount = filteredGroups.reduce((n, g) => n + g.endpoints.length, 0);
  const isFiltered = activeFilters.size > 0 || search.trim().length > 0;

  const borderColor = dark ? "border-neutral-700" : "border-slate-200";
  const bgClass = dark ? "bg-neutral-900" : "bg-slate-50";
  const textMain = dark ? "text-neutral-100" : "text-slate-800";
  const textMuted = dark ? "text-neutral-500" : "text-slate-400";
  const dividerColor = dark ? "divide-neutral-800" : "divide-slate-100";

  function toggleRow(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleGroup(gi: number) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(gi) ? next.delete(gi) : next.add(gi);
      return next;
    });
  }

  function toggleMethodFilter(m: HttpMethod) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  function clearFilters() {
    setActiveFilters(new Set());
    setSearch("");
  }

  return (
    <div className={cn("rounded-lg border mt-2", borderColor, bgClass)}>
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasEndpoints}
      >
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-amber-500" />
          <span className={textMain}>API Surface</span>
          {hasEndpoints && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {isFiltered && open ? `${filteredCount} / ${totalCount}` : `${totalCount}`} {totalCount === 1 ? "endpoint" : "endpoints"}
            </span>
          )}
        </div>
        {hasEndpoints && (
          <ChevronRight
            className={cn("size-4 transition-transform", textMuted, open && "rotate-90")}
          />
        )}
        {!hasEndpoints && (
          <span className={cn("text-xs", textMuted)}>Generate Endpoints section first</span>
        )}
      </button>

      {/* Body */}
      {open && hasEndpoints && (
        <div className={cn("border-t", borderColor)}>

          {/* Method filter + search bar */}
          <div className={cn("px-4 py-3 border-b space-y-2.5", dark ? "border-neutral-800" : "border-slate-100")}>
            {/* Method filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {activeMethods.map((m) => {
                const isActive = activeFilters.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethodFilter(m)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all",
                      METHOD_STYLES[m],
                      isActive ? METHOD_ACTIVE_RING[m] : "opacity-70 hover:opacity-100",
                    )}
                  >
                    {m}
                    <span className="font-normal opacity-60">{methodCounts.get(m)}</span>
                  </button>
                );
              })}
              {isFiltered && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={cn(
                    "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    dark ? "bg-neutral-700 text-neutral-300 hover:bg-neutral-600" : "bg-slate-200 text-slate-600 hover:bg-slate-300",
                  )}
                >
                  <X className="size-2.5" /> Clear
                </button>
              )}
            </div>

            {/* Proportional bar */}
            <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-px">
              {activeMethods.map((m) => (
                <div
                  key={m}
                  onClick={() => toggleMethodFilter(m)}
                  className={cn(
                    "h-full transition-all cursor-pointer",
                    METHOD_BAR_COLOR[m],
                    activeFilters.size > 0 && !activeFilters.has(m) && "opacity-25",
                  )}
                  style={{ width: `${((methodCounts.get(m) ?? 0) / totalCount) * 100}%` }}
                  title={`${m}: ${methodCounts.get(m)} — click to filter`}
                />
              ))}
            </div>

            {/* Search */}
            <div className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5", dark ? "border-neutral-700 bg-neutral-800" : "border-slate-200 bg-white")}>
              <Search className={cn("size-3 shrink-0", textMuted)} />
              <input
                type="text"
                placeholder="Filter by path…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn("flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500", dark ? "text-neutral-200" : "text-slate-700")}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  <X className={cn("size-3", textMuted)} />
                </button>
              )}
            </div>
          </div>

          {/* No results state */}
          {filteredGroups.length === 0 && (
            <div className={cn("px-4 py-6 text-center text-xs", textMuted)}>
              No endpoints match — <button type="button" className="underline" onClick={clearFilters}>clear filters</button>
            </div>
          )}

          {/* Groups + accordion rows */}
          {filteredGroups.map((group, gi) => {
            const isGroupCollapsed = collapsedGroups.has(gi);
            return (
              <div key={gi}>
                {/* Group heading — clickable to collapse */}
                <button
                  type="button"
                  onClick={() => toggleGroup(gi)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-1.5 text-left border-t",
                    dark ? "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800 border-neutral-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-100",
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest">{group.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[10px]", textMuted)}>{group.endpoints.length}</span>
                    {isGroupCollapsed
                      ? <ChevronRight className="size-3" />
                      : <ChevronDown className="size-3" />}
                  </div>
                </button>

                {!isGroupCollapsed && (
                  <div className={cn("divide-y", dividerColor)}>
                    {group.endpoints.map((ep, ei) => {
                      const key = `${gi}-${ei}`;
                      const isExpanded = expandedRows.has(key);
                      const hasSchema = Boolean(ep.input || ep.output);
                      const inputFields = ep.input ? parseFields(ep.input) : [];
                      const outputFields = ep.output ? parseFields(ep.output) : [];

                      return (
                        <div key={ei}>
                          {/* Collapsed row */}
                          <button
                            type="button"
                            onClick={() => hasSchema && toggleRow(key)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 font-mono text-xs text-left transition-colors",
                              dark ? "hover:bg-neutral-800/60" : "hover:bg-slate-100/80",
                              hasSchema ? "cursor-pointer" : "cursor-default",
                            )}
                          >
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold w-14 text-center",
                                METHOD_STYLES[ep.method],
                              )}
                            >
                              {ep.method}
                            </span>
                            <span className={cn("flex-1 break-all", dark ? "text-neutral-200" : "text-slate-700")}>
                              {ep.path}
                            </span>
                            {ep.auth && (
                              <span className={cn("shrink-0 text-[10px]", textMuted)}>{ep.auth}</span>
                            )}
                            {hasSchema && (
                              isExpanded
                                ? <ChevronDown className={cn("shrink-0 size-3", textMuted)} />
                                : <ChevronRight className={cn("shrink-0 size-3", textMuted)} />
                            )}
                          </button>

                          {/* Expanded schema panel */}
                          {isExpanded && hasSchema && (
                            <div
                              className={cn(
                                "px-4 pb-3 pt-1 border-t",
                                dark ? "bg-neutral-800/40 border-neutral-800" : "bg-slate-50 border-slate-100",
                              )}
                            >
                              {inputFields.length > 0 && (
                                <div className="mb-2">
                                  <p className={cn("text-[9px] font-bold uppercase tracking-wider mb-1.5", dark ? "text-sky-500" : "text-sky-600")}>
                                    Request
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {inputFields.map((f, i) => (
                                      <span
                                        key={i}
                                        className={cn(
                                          "rounded px-1.5 py-0.5 font-mono text-[10px]",
                                          dark ? "bg-sky-900/40 text-sky-300" : "bg-sky-50 text-sky-700 border border-sky-200",
                                        )}
                                      >
                                        <span className="font-semibold">{f.key}</span>
                                        <span className={dark ? "text-sky-500" : "text-sky-400"}>:{f.type}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {outputFields.length > 0 && (
                                <div>
                                  <p className={cn("text-[9px] font-bold uppercase tracking-wider mb-1.5", dark ? "text-emerald-500" : "text-emerald-600")}>
                                    Response
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {outputFields.map((f, i) => (
                                      <span
                                        key={i}
                                        className={cn(
                                          "rounded px-1.5 py-0.5 font-mono text-[10px]",
                                          dark ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                        )}
                                      >
                                        <span className="font-semibold">{f.key}</span>
                                        <span className={dark ? "text-emerald-500" : "text-emerald-400"}>:{f.type}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
