"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Zap } from "lucide-react";
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
// Field pill parser  "key:type, key2:type2" → [{key, type}]
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
// Method distribution summary bar
// ---------------------------------------------------------------------------

function MethodSummaryBar({
  groups,
  total,
  dark,
}: {
  groups: EndpointGroup[];
  total: number;
  dark: boolean;
}) {
  const counts = new Map<HttpMethod, number>();
  for (const g of groups) {
    for (const ep of g.endpoints) {
      counts.set(ep.method, (counts.get(ep.method) ?? 0) + 1);
    }
  }
  const active = METHOD_ORDER.filter((m) => (counts.get(m) ?? 0) > 0);

  return (
    <div className={cn("px-4 py-3 border-b", dark ? "border-neutral-800" : "border-slate-100")}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {active.map((m) => (
          <span
            key={m}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
              METHOD_STYLES[m],
            )}
          >
            {m}
            <span className="opacity-60 font-normal">{counts.get(m)}</span>
          </span>
        ))}
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-px">
        {active.map((m) => (
          <div
            key={m}
            className={cn("h-full transition-all", METHOD_BAR_COLOR[m])}
            style={{ width: `${((counts.get(m) ?? 0) / total) * 100}%` }}
            title={`${m}: ${counts.get(m)}`}
          />
        ))}
      </div>
    </div>
  );
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

  const groups = parseEndpoints(endpointsContent);
  const totalCount = groups.reduce((n, g) => n + g.endpoints.length, 0);
  const hasEndpoints = totalCount > 0;

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
              {totalCount} {totalCount === 1 ? "endpoint" : "endpoints"}
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
          {/* Method distribution summary */}
          <MethodSummaryBar groups={groups} total={totalCount} dark={dark} />

          {/* Groups + accordion rows */}
          {groups.map((group, gi) => (
            <div key={gi}>
              <div
                className={cn(
                  "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest",
                  dark ? "bg-neutral-800/60 text-neutral-400" : "bg-slate-100 text-slate-500",
                  `border-t ${borderColor}`,
                )}
              >
                {group.name}
              </div>

              <div className={cn("divide-y", dividerColor)}>
                {group.endpoints.map((ep, ei) => {
                  const key = `${gi}-${ei}`;
                  const isExpanded = expandedRows.has(key);
                  const hasSchema = Boolean(ep.input || ep.output);
                  const inputFields = ep.input ? parseFields(ep.input) : [];
                  const outputFields = ep.output ? parseFields(ep.output) : [];

                  return (
                    <div key={ei}>
                      {/* Collapsed row — always visible */}
                      <button
                        type="button"
                        onClick={() => hasSchema && toggleRow(key)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 font-mono text-xs text-left transition-colors",
                          dark ? "hover:bg-neutral-800/60" : "hover:bg-slate-100/80",
                          hasSchema ? "cursor-pointer" : "cursor-default",
                        )}
                      >
                        {/* Method badge */}
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold w-14 text-center",
                            METHOD_STYLES[ep.method],
                          )}
                        >
                          {ep.method}
                        </span>

                        {/* Path */}
                        <span className={cn("flex-1 break-all", dark ? "text-neutral-200" : "text-slate-700")}>
                          {ep.path}
                        </span>

                        {/* Auth */}
                        {ep.auth && (
                          <span className={cn("shrink-0 text-[10px]", textMuted)}>{ep.auth}</span>
                        )}

                        {/* Expand chevron */}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
