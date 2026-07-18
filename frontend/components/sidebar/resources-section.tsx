"use client";
import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";

type ResourcesSectionProps = DragSectionProps & {
  dark: boolean;
  pmWebUrl: string;
  pmTool: "taiga" | "jira";
};

const TAIGA_DOCS: { href: string; labelKey: TranslationKey }[] = [
  { href: "https://docs.taiga.io/", labelKey: "resources.userGuide" },
  { href: "https://docs.taiga.io/api.html", labelKey: "resources.apiReference" },
  { href: "https://community.taiga.io/", labelKey: "resources.communityForum" },
  { href: "https://github.com/taigaio", labelKey: "resources.github" },
];

const JIRA_DOCS: { href: string; labelKey: TranslationKey }[] = [
  { href: "https://support.atlassian.com/jira-software-cloud/", labelKey: "resources.userGuide" },
  { href: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/", labelKey: "resources.apiReference" },
  { href: "https://community.atlassian.com/", labelKey: "resources.communityForum" },
  { href: "https://id.atlassian.com/manage-profile/security/api-tokens", labelKey: "resources.manageApiTokens" },
];

export function ResourcesSection({ dark, pmWebUrl, pmTool, shellClass, dragHandlers, onDragStart }: ResourcesSectionProps) {
  const t = useT();
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";

  const docs = pmTool === "jira" ? JIRA_DOCS : TAIGA_DOCS;
  const docsLabel = pmTool === "jira" ? t("resources.jiraDocs") : t("resources.taigaDocs");
  const instanceLabel = pmTool === "jira" ? t("resources.openJira") : t("resources.openTaiga");

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<BookOpen className="size-4" />}
          title={t("resources.panelTitle")}
          open={resourcesOpen}
          onClick={() => setResourcesOpen(!resourcesOpen)}
          onDragStart={onDragStart}
        />
        {resourcesOpen ? (
          <div className={cn("px-4 py-3", expandedPanelClass)}>
            <p className={cn("mb-2 text-xs font-semibold", subduedTextClass)}>{docsLabel}</p>
            <div className="space-y-0.5">
              {docs.map(({ href, labelKey }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-violet-500/10", dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-600")}
                >
                  <ExternalLink className="size-3 shrink-0" />
                  {t(labelKey)}
                </a>
              ))}
            </div>
            {pmWebUrl ? (
              <>
                <p className={cn("mb-2 mt-4 text-xs font-semibold", subduedTextClass)}>{t("resources.instance")}</p>
                <a
                  href={pmWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-violet-500/10", dark ? "text-violet-300 hover:text-violet-200" : "text-violet-700 hover:text-violet-600")}
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
