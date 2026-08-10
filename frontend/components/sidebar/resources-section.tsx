"use client";
import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useSessionStore } from "@/lib/stores/session-store";
import { getPmAdapter } from "@/lib/api/pm-factory";

type ResourcesSectionProps = DragSectionProps & {
  dark: boolean;
  // Taiga's instance link — sourced from the backend's GET /config, which is
  // still Taiga-only (see plane_integration_plan memory, phase 5f). Ignored
  // for a Plane session; the Plane instance link below is computed client-side
  // instead, since plane-adapter.ts's getWebUrl already derives it correctly
  // from the session's own taigaApiUrl (confirmed correct, phase 5d) — no need
  // to round-trip a value the frontend can derive itself.
  pmWebUrl: string;
};

const TAIGA_DOCS: { href: string; labelKey: TranslationKey }[] = [
  { href: "https://docs.taiga.io/", labelKey: "resources.userGuide" },
  { href: "https://docs.taiga.io/api.html", labelKey: "resources.apiReference" },
  { href: "https://community.taiga.io/", labelKey: "resources.communityForum" },
  { href: "https://github.com/taigaio", labelKey: "resources.github" },
];

const PLANE_DOCS: { href: string; labelKey: TranslationKey }[] = [
  { href: "https://docs.plane.so/", labelKey: "resources.userGuide" },
  { href: "https://developers.plane.so/", labelKey: "resources.apiReference" },
  { href: "https://plane.so/changelog", labelKey: "resources.communityForum" },
  { href: "https://github.com/makeplane/plane", labelKey: "resources.github" },
];

export function ResourcesSection({ dark, pmWebUrl, shellClass, dragHandlers, onDragStart }: ResourcesSectionProps) {
  const t = useT();
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const pmTool = useSessionStore((s) => s.pmTool);
  const taigaApiUrl = useSessionStore((s) => s.taigaApiUrl);
  const isPlane = pmTool === "plane";

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";

  const docs = isPlane ? PLANE_DOCS : TAIGA_DOCS;
  const docsLabel = isPlane ? t("resources.planeDocs") : t("resources.taigaDocs");
  const instanceLabel = isPlane ? t("resources.openPlane") : t("resources.openTaiga");
  const instanceUrl = isPlane
    ? (taigaApiUrl ? getPmAdapter("plane").getWebUrl(taigaApiUrl) : "")
    : pmWebUrl;

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
            {instanceUrl ? (
              <>
                <p className={cn("mb-2 mt-4 text-xs font-semibold", subduedTextClass)}>{t("resources.instance")}</p>
                <a
                  href={instanceUrl}
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
