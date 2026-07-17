"use client";
import { useState } from "react";
import { DollarSign } from "lucide-react";
import { useUsageSummary } from "@/lib/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type UsageSectionProps = DragSectionProps & { dark: boolean };

function fmtUsd(n: number): string {
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function UsageSection({ dark, shellClass, dragHandlers, onDragStart }: UsageSectionProps) {
  const [open, setOpen] = useState(false);
  const usage = useUsageSummary(30);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const mutedText = dark ? "text-neutral-500" : "text-slate-500";
  const labelText = dark ? "text-neutral-400" : "text-slate-600";
  const rowText = dark ? "text-neutral-300" : "text-slate-700";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<DollarSign className="size-4" />}
          title="Usage"
          badge={usage.data ? fmtUsd(usage.data.total_cost_usd) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("space-y-4 px-4 py-4 text-sm", expandedPanelClass)}>
            {usage.isLoading ? (
              <p className={cn("text-xs", mutedText)}>Loading…</p>
            ) : usage.isError ? (
              <p className="text-xs text-red-400">Failed to load usage.</p>
            ) : usage.data ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
	                    <p className={cn("text-xs uppercase tracking-wide", mutedText)}>Last 30 days</p>
                    <p className={cn("text-lg font-semibold", dark ? "text-white" : "text-slate-900")}>
                      {fmtUsd(usage.data.total_cost_usd)}
                    </p>
                  </div>
                  <div>
	                    <p className={cn("text-xs uppercase tracking-wide", mutedText)}>AI calls</p>
                    <p className={cn("text-lg font-semibold", dark ? "text-white" : "text-slate-900")}>
                      {usage.data.total_calls}
                    </p>
                  </div>
                </div>
                <p className={cn("text-xs", mutedText)}>
                  {usage.data.total_input_tokens.toLocaleString()} in · {usage.data.total_output_tokens.toLocaleString()} out
                  {usage.data.total_cache_read_tokens > 0
                    ? ` · ${usage.data.total_cache_read_tokens.toLocaleString()} cached`
                    : ""}
                </p>

                {usage.data.by_model.length > 0 ? (
                  <div>
                    <p className={cn("mb-1.5 text-xs font-semibold", labelText)}>By model</p>
                    <div className="space-y-1">
                      {usage.data.by_model.map((row) => (
                        <div key={row.model} className="flex items-center justify-between gap-2 text-xs">
                          <span className={cn("truncate", rowText)}>{row.model}</span>
                          <span className={cn("shrink-0", mutedText)}>{row.calls}× · {fmtUsd(row.cost_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {usage.data.by_call.length > 0 ? (
                  <div>
                    <p className={cn("mb-1.5 text-xs font-semibold", labelText)}>By call</p>
                    <div className="space-y-1">
                      {usage.data.by_call.slice(0, 8).map((row) => (
                        <div key={row.call} className="flex items-center justify-between gap-2 text-xs">
                          <span className={cn("truncate", rowText)}>{row.call}</span>
                          <span className={cn("shrink-0", mutedText)}>{row.calls}× · {fmtUsd(row.cost_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {usage.data.total_calls === 0 ? (
                  <p className={cn("text-xs", mutedText)}>No AI calls recorded yet.</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
