"use client";
import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type ResourcesSectionProps = DragSectionProps & {
  dark: boolean;
  pmWebUrl: string;
  pmTool: "taiga" | "jira";
};

const TAIGA_DOCS = [
  { href: "https://docs.taiga.io/", label: "User Guide" },
  { href: "https://docs.taiga.io/api.html", label: "API Reference" },
  { href: "https://community.taiga.io/", label: "Community Forum" },
  { href: "https://github.com/taigaio", label: "GitHub" },
];

const JIRA_DOCS = [
  { href: "https://support.atlassian.com/jira-software-cloud/", label: "User Guide" },
  { href: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/", label: "API Reference" },
  { href: "https://community.atlassian.com/", label: "Community Forum" },
  { href: "https://id.atlassian.com/manage-profile/security/api-tokens", label: "Manage API Tokens" },
];

export function ResourcesSection({ dark, pmWebUrl, pmTool, shellClass, dragHandlers, onDragStart }: ResourcesSectionProps) {
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";

  const docs = pmTool === "jira" ? JIRA_DOCS : TAIGA_DOCS;
  const docsLabel = pmTool === "jira" ? "Jira Documentation" : "Taiga Documentation";
  const instanceLabel = pmTool === "jira" ? "Open Jira" : "Open Taiga";

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<BookOpen className="size-4" />}
          title="Resources"
          open={resourcesOpen}
          onClick={() => setResourcesOpen(!resourcesOpen)}
          onDragStart={onDragStart}
        />
        {resourcesOpen ? (
          <div className={cn("px-4 py-3", expandedPanelClass)}>
            <p className={cn("mb-2 text-xs font-semibold", subduedTextClass)}>{docsLabel}</p>
            <div className="space-y-0.5">
              {docs.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                >
                  <ExternalLink className="size-3 shrink-0" />
                  {label}
                </a>
              ))}
            </div>
            {pmWebUrl ? (
              <>
                <p className={cn("mb-2 mt-4 text-xs font-semibold", subduedTextClass)}>Instance</p>
                <a
                  href={pmWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                >
                  <ExternalLink className="size-3 shrink-0" />
                  {instanceLabel}
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
