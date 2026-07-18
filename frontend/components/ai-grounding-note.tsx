"use client";

import { Check, ChevronRight, FileText, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ContextFile } from "@/lib/api/types";
import { useT } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

type Props = {
  files: readonly string[];
  dark: boolean;
  className?: string;
  availableFiles?: readonly ContextFile[];
  selectedExtraFiles?: readonly string[];
  onSelectedExtraFilesChange?: (files: string[]) => void;
};

export function AiGroundingNote({
  files,
  dark,
  className,
  availableFiles = [],
  selectedExtraFiles = [],
  onSelectedExtraFilesChange,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(selectedExtraFiles), [selectedExtraFiles]);
  const fixed = useMemo(() => new Set(files), [files]);
  const selectableFiles = availableFiles.filter((file) => file.content.trim() && !fixed.has(file.filename));
  const effectiveFiles = [...files, ...selectedExtraFiles];
  const canPick = Boolean(onSelectedExtraFilesChange && selectableFiles.length);
  if (!effectiveFiles.length) return null;

  function toggleFile(filename: string) {
    if (!onSelectedExtraFilesChange) return;
    const next = new Set(selectedExtraFiles);
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    onSelectedExtraFilesChange([...next]);
  }

  return (
    <div className={cn("text-xs leading-5", dark ? "text-neutral-500" : "text-slate-500", className)}>
      <div
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1"
        title={`${t("grounding.label")}: ${effectiveFiles.join(", ")}`}
      >
        <FileText className={cn("size-3.5 shrink-0", dark ? "text-violet-400/80" : "text-violet-600/80")} />
        <span>
          <span className={cn("font-semibold", dark ? "text-neutral-400" : "text-slate-600")}>{t("grounding.label")}</span>
          {" "}
          {files.join(" · ")}
        </span>
        {selectedExtraFiles.map((filename) => (
          <button
            key={filename}
            type="button"
            onClick={() => toggleFile(filename)}
            className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5", dark ? "border-violet-500/30 text-violet-300 hover:bg-violet-500/10" : "border-violet-200 text-violet-700 hover:bg-violet-50")}
            title={t("grounding.removeFile", { file: filename })}
          >
            <X className="size-3" />
            <span className="font-mono">{filename}</span>
          </button>
        ))}
        {canPick ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium", dark ? "border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-violet-300" : "border-slate-300 text-slate-600 hover:border-violet-300 hover:text-violet-700")}
            title={t("grounding.addContext")}
          >
            <Plus className="size-3" />
            {t("grounding.add")}
            <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
          </button>
        ) : null}
      </div>
      {open && canPick ? (
        <div className={cn("mt-2 max-h-48 overflow-auto rounded border p-2", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-white")}>
          {selectableFiles.map((file) => {
            const isSelected = selected.has(file.filename);
            return (
              <button
                key={file.filename}
                type="button"
                onClick={() => toggleFile(file.filename)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
                  dark ? "hover:bg-neutral-900" : "hover:bg-slate-50",
                  isSelected && (dark ? "bg-violet-500/10 text-violet-300" : "bg-violet-50 text-violet-700"),
                )}
              >
                <span className={cn("grid size-4 place-items-center rounded border", isSelected ? "border-violet-400" : dark ? "border-neutral-700" : "border-slate-300")}>
                  {isSelected ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono">{file.filename}</span>
                  {file.label && file.label !== file.filename ? (
                    <span className="ml-2 opacity-70">{file.label}</span>
                  ) : null}
                  <span className="ml-2 opacity-70">{file.chars} ch</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
