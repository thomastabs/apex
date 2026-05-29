"use client";

import { useState } from "react";
import { ChevronRight, Zap } from "lucide-react";
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
const PATH_RE = /(?:^|\s)(\/[^\s·|\],)}\n]+)/;

function parseEndpoints(markdown: string): EndpointGroup[] {
  const lines = markdown.split("\n");
  const groups: EndpointGroup[] = [];
  let current: EndpointGroup = { name: "Endpoints", endpoints: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Section heading → new group
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

    // Auth: text between first and second · separator, or after the path
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
// Method badge styles
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

  const groups = parseEndpoints(endpointsContent);
  const totalCount = groups.reduce((n, g) => n + g.endpoints.length, 0);
  const hasEndpoints = totalCount > 0;

  const borderColor = dark ? "border-neutral-700" : "border-slate-200";
  const bgClass = dark ? "bg-neutral-900" : "bg-slate-50";
  const textMain = dark ? "text-neutral-100" : "text-slate-800";
  const textMuted = dark ? "text-neutral-500" : "text-slate-400";
  const rowHover = dark ? "hover:bg-neutral-800/60" : "hover:bg-slate-100/80";
  const dividerColor = dark ? "divide-neutral-800" : "divide-slate-100";

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
          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Group heading */}
              <div
                className={cn(
                  "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest",
                  dark ? "bg-neutral-800/60 text-neutral-400" : "bg-slate-100 text-slate-500",
                  gi > 0 && `border-t ${borderColor}`,
                )}
              >
                {group.name}
              </div>

              {/* Endpoint rows */}
              <div className={cn("divide-y", dividerColor)}>
                {group.endpoints.map((ep, ei) => (
                  <div
                    key={ei}
                    className={cn("flex items-start gap-3 px-4 py-2.5 font-mono text-xs transition-colors", rowHover)}
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

                    {/* in/out */}
                    <div className="shrink-0 flex flex-col gap-0.5 text-[10px] text-right">
                      {ep.input && (
                        <span className={dark ? "text-sky-400" : "text-sky-600"}>
                          in: {"{" + ep.input + "}"}
                        </span>
                      )}
                      {ep.output && (
                        <span className={dark ? "text-emerald-400" : "text-emerald-600"}>
                          out: {"{" + ep.output + "}"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
