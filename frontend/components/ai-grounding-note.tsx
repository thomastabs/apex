"use client";

import { FileText } from "lucide-react";
import { useT } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

type Props = {
  files: readonly string[];
  dark: boolean;
  className?: string;
};

export function AiGroundingNote({ files, dark, className }: Props) {
  const t = useT();
  if (!files.length) return null;

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-5",
        dark ? "text-neutral-500" : "text-slate-500",
        className,
      )}
      title={`${t("grounding.label")}: ${files.join(", ")}`}
    >
      <FileText className={cn("mt-0.5 size-3.5 shrink-0", dark ? "text-violet-400/80" : "text-violet-600/80")} />
      <span>
        <span className={cn("font-semibold", dark ? "text-neutral-400" : "text-slate-600")}>{t("grounding.label")}</span>
        {" "}
        {files.join(" · ")}
      </span>
    </p>
  );
}
