"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Download, FileText, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useContextFiles,
  useRebuildStoryIndex,
  useResetAllContextFiles,
  useResetContextFile,
  useUpdateContextFile,
} from "@/lib/hooks/use-workspace";
import { useGenerateConstraints } from "@/lib/hooks/use-phase1";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

// ── utilities ─────────────────────────────────────────────────────────────────

function contextSizeColor(totalChars: number): string {
  if (totalChars < 30_000) return "#4ade80";
  if (totalChars < 80_000) return "#facc15";
  return "#f87171";
}

function ContextSizeWarning({ totalChars }: { totalChars: number }) {
  if (totalChars >= 200_000) {
    return (
      <div className="mb-3 rounded border border-red-600 bg-red-950/50 px-3 py-2 text-xs text-red-300">
        <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — exceeds Claude&apos;s limit. AI calls will fail. Delete or reset context files.
      </div>
    );
  }
  if (totalChars >= 150_000) {
    return (
      <div className="mb-3 rounded border border-orange-700 bg-orange-950/30 px-3 py-2 text-xs text-orange-300">
        <strong>Context at {Math.round(totalChars / 1000)}k chars</strong> — approaching Claude&apos;s limit. Consider trimming context files.
      </div>
    );
  }
  return null;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(diff / 86_400_000);
  return `${days}d ago`;
}

const CONTEXT_FILE_PHASES: Record<string, string[]> = {
  "/phase1": ["project-concept.md", "functional-spec.md", "constraints.md"],
  "/phase2": ["project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md", "design-bundle.md", "github-context.md"],
  "/phase3": ["project-concept.md", "tech-stack.md", "design-bundle.md", "github-context.md", "constraints.md"],
  "/phase4": ["project-concept.md", "tech-stack.md", "technical-spec.md", "constraints.md"],
};

function useVisibleContextFiles(
  files: Array<{ filename: string; label: string; content: string; chars: number; last_modified?: string | null }> | undefined,
) {
  const pathname = usePathname();
  return useMemo(() => {
    if (!files) return [];
    const allowed = CONTEXT_FILE_PHASES[pathname];
    if (!allowed) return files;
    return files.filter((f) => allowed.includes(f.filename));
  }, [files, pathname]);
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

let crcTable: Uint32Array | null = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}
function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU16(target: number[], value: number) { target.push(value & 0xff, (value >>> 8) & 0xff); }
function writeU32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function downloadContextZip(files: Array<{ filename: string; content: string }>) {
  if (!files.length) { toast.error("No context files to download"); return; }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.filename);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local: number[] = [];
    writeU32(local, 0x04034b50); writeU16(local, 20); writeU16(local, 0x0800);
    writeU16(local, 0); writeU16(local, 0); writeU16(local, 0);
    writeU32(local, checksum); writeU32(local, data.length); writeU32(local, data.length);
    writeU16(local, nameBytes.length); writeU16(local, 0);
    chunks.push(new Uint8Array(local), nameBytes, data);
    const central: number[] = [];
    writeU32(central, 0x02014b50); writeU16(central, 20); writeU16(central, 20); writeU16(central, 0x0800);
    writeU16(central, 0); writeU16(central, 0); writeU16(central, 0);
    writeU32(central, checksum); writeU32(central, data.length); writeU32(central, data.length);
    writeU16(central, nameBytes.length); writeU16(central, 0); writeU16(central, 0);
    writeU16(central, 0); writeU16(central, 0); writeU32(central, 0); writeU32(central, offset);
    centralDirectory.push(new Uint8Array(central), nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end: number[] = [];
  writeU32(end, 0x06054b50); writeU16(end, 0); writeU16(end, 0);
  writeU16(end, files.length); writeU16(end, files.length);
  writeU32(end, centralSize); writeU32(end, centralOffset); writeU16(end, 0);
  const zipParts = [...chunks, ...centralDirectory, new Uint8Array(end)].map((chunk) => {
    const copy = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(copy).set(chunk);
    return copy;
  });
  const blob = new Blob(zipParts, { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "apex-context-files.zip"; a.click();
  URL.revokeObjectURL(url);
}

function MarkdownPreview({ content }: { content: string }) {
  const [html, setHtml] = useState("");
  const dark = useUiStore((state) => state.theme) === "dark";
  useEffect(() => {
    async function render() {
      const { marked } = await import("marked");
      const DOMPurify = (await import("dompurify")).default;
      const raw = await marked.parse(content || "");
      setHtml(DOMPurify.sanitize(raw));
    }
    void render();
  }, [content]);
  return (
    <div
      className={cn("prose prose-sm max-w-none overflow-auto p-3 text-xs leading-5", dark ? "prose-invert" : "prose-slate")}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ContextEditor({
  file,
  onConfirm,
}: {
  file: { filename: string; label: string; content: string };
  onConfirm: (msg: string, cb: () => void) => void;
}) {
  const [value, setValue] = useState(file.content);
  const [mdPreview, setMdPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useUpdateContextFile();
  const reset = useResetContextFile();
  const genConstraints = useGenerateConstraints();
  const isConstraints = file.filename === "constraints.md";
  const dark = useUiStore((state) => state.theme) === "dark";

  function handleGenerateConstraints() {
    genConstraints.mutate(undefined, {
      onSuccess: (res) => {
        setValue(res.constraints_md);
        update.mutate({ filename: file.filename, content: res.constraints_md });
        toast.success(`Generated ${res.constraints.length} constraints`);
      },
    });
  }

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setValue(file.content);
  }, [file.content]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleChange(newValue: string) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      update.mutate({ filename: file.filename, content: newValue });
    }, 700);
  }

  const statusLabel = update.isPending ? "Saving…" : update.isError ? "Error" : update.isSuccess ? "Saved" : "";
  const statusColor = update.isError ? "text-red-400" : dark ? "text-neutral-500" : "text-slate-500";

  return (
    <div className={cn("border-t", dark ? "border-neutral-800" : "border-slate-200")}>
      <div className={cn("flex items-center gap-2 border-b px-3 py-1", dark ? "border-neutral-800" : "border-slate-200")}>
        <span className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{value.length} ch</span>
        {statusLabel ? <span className={cn("text-xs", statusColor)}>{statusLabel}</span> : null}
        <div className="flex-1" />
        {isConstraints ? (
          <button
            className="flex items-center gap-1 rounded bg-violet-700 px-2 py-0.5 text-xs font-semibold text-violet-50 hover:bg-violet-600 disabled:opacity-50"
            disabled={genConstraints.isPending}
            onClick={handleGenerateConstraints}
          >
            <Sparkles className="size-3" /> {genConstraints.isPending ? "Generating…" : "Generate with AI"}
          </button>
        ) : null}
        <button
          className={cn("rounded px-2 py-0.5 text-xs", mdPreview ? "bg-violet-800 text-violet-100" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100")}
          onClick={() => setMdPreview(!mdPreview)}
        >
          {mdPreview ? "Raw" : "Preview"}
        </button>
      </div>
      {mdPreview ? (
        <MarkdownPreview content={value} />
      ) : (
        <textarea
          className={cn("h-56 w-full resize-y p-3 font-mono text-xs leading-5 outline-none", dark ? "bg-neutral-950 text-neutral-200" : "bg-white text-slate-800")}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
      <div className="grid grid-cols-2 gap-2 p-2">
        <button
          className={cn("flex h-8 items-center justify-center gap-1 rounded text-xs", dark ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
          onClick={() => downloadFile(file.filename, value)}
        >
          <Download className="size-3" /> Download
        </button>
        <button
          className="h-8 rounded bg-red-950/70 text-xs font-semibold text-red-300 disabled:opacity-50"
          disabled={reset.isPending}
          onClick={() => onConfirm(`Reset ${file.label} to default?`, () => reset.mutate(file.filename))}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

// ── ContextSection ────────────────────────────────────────────────────────────

type ContextSectionProps = DragSectionProps & {
  dark: boolean;
  projectId: number;
  confirm: (msg: string, cb: () => void) => void;
};

export function ContextSection({ dark, projectId: _projectId, confirm, shellClass, dragHandlers, onDragStart }: ContextSectionProps) {
  const [contextOpen, setContextOpen] = useState(true);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);

  const contextFiles = useContextFiles();
  const rebuildIndex = useRebuildStoryIndex();
  const resetAll = useResetAllContextFiles();

  useEffect(() => {
    if (!contextFiles.isLoading) return;
    const id = toast.loading("Loading project context…");
    return () => { toast.dismiss(id); };
  }, [contextFiles.isLoading]);

  const totalChars = contextFiles.data?.total_chars ?? 0;
  const sizeColor = contextSizeColor(totalChars);
  const visibleFiles = useVisibleContextFiles(contextFiles.data?.files);

  const projectConcept = contextFiles.data?.files.find((f) => f.filename === "project-concept.md")?.content ?? "";
  const hasProjectConcept = useMemo(() => {
    const text = projectConcept.replace(/^#[^\n]*\n/, "").trim();
    return Boolean(text) && !text.startsWith("<!--");
  }, [projectConcept]);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<FileText className="size-4" />}
          title="Active Context"
          badge={`${totalChars} ch`}
          open={contextOpen}
          onClick={() => setContextOpen(!contextOpen)}
          onDragStart={onDragStart}
        />
        {contextOpen ? (
          <div className={cn("px-4 py-4", expandedPanelClass)}>
            <div className={cn("mb-3 text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
              context:{" "}
              <span className="font-bold" style={{ color: sizeColor }}>
                {totalChars} chars
              </span>
            </div>
            <ContextSizeWarning totalChars={totalChars} />
            {!hasProjectConcept && contextFiles.data ? (
              <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                Project Concept file is empty. Fill it in for best AI results.
              </div>
            ) : null}
            <div className="mb-4 space-y-3">
              {visibleFiles.map((file) => (
                <div
                  key={file.filename}
                  className={cn(
                    "group rounded-md border transition-all duration-200 ease-out",
                    dark
                      ? "border-neutral-700 bg-[#17181d] hover:border-violet-500/60 hover:bg-[#232638] hover:shadow-[0_0_0_1px_rgba(139,92,246,0.22)]"
                      : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-sm",
                  )}
                >
                  <button
                    className="flex h-10 w-full items-center gap-3 px-4 text-left transition-colors duration-200"
                    onClick={() => setExpandedContext(expandedContext === file.filename ? null : file.filename)}
                  >
                    <ChevronRight className={cn(
                      "size-3 transition-all duration-200 group-hover:text-violet-400",
                      dark ? "text-neutral-500" : "text-slate-400",
                      expandedContext === file.filename && "rotate-90 text-violet-400",
                    )} />
                    <FileText className="size-4 text-violet-400 transition-colors duration-200 group-hover:text-violet-300" />
                    <span className={cn("flex-1 text-sm font-medium transition-colors duration-200", dark ? "text-white group-hover:text-violet-100" : "text-slate-950 group-hover:text-violet-900")}>
                      {file.label}
                    </span>
                    <span className={cn("text-xs transition-colors duration-200", dark ? "text-neutral-500 group-hover:text-violet-300" : "text-slate-500 group-hover:text-violet-600")}>
                      {file.chars} ch
                      {relativeTime(file.last_modified) ? (
                        <span className="ml-1.5 opacity-60">· {relativeTime(file.last_modified)}</span>
                      ) : null}
                    </span>
                  </button>
                  {expandedContext === file.filename ? (
                    <ContextEditor file={file} onConfirm={confirm} />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button
                className="flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-200 disabled:opacity-40"
                disabled={contextFiles.isFetching}
                onClick={() => { contextFiles.refetch(); toast.info("Context reloaded"); }}
              >
                <span>Reload context</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className="flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-200 disabled:opacity-40"
                disabled={!contextFiles.data?.files.length}
                onClick={() => { downloadContextZip(contextFiles.data?.files ?? []); toast.success("Context ZIP downloaded"); }}
              >
                <span>Download all context files</span>
                <Download className="size-4 text-violet-400" />
              </button>
              <button
                className="flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-200 disabled:opacity-40"
                disabled={rebuildIndex.isPending}
                onClick={() => rebuildIndex.mutate(undefined, {
                  onSuccess: () => toast.success("Story index rebuilt"),
                  onError: () => toast.error("Failed to rebuild story index"),
                })}
              >
                <span>Rebuild story index</span>
                <RefreshCw className="size-4 text-violet-400" />
              </button>
              <button
                className="flex h-9 w-full items-center justify-between rounded border border-red-500/30 px-3 text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                disabled={resetAll.isPending}
                onClick={() => confirm("Reset ALL context files to defaults? This cannot be undone.", () => resetAll.mutate(undefined, { onSuccess: () => toast.success("All context files reset") }))}
              >
                <span>Reset all context files</span>
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
