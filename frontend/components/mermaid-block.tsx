"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useUiStore } from "@/lib/stores/ui-store";

type Props = {
  content: string;
  className?: string;
};

function extractMermaidFences(text: string): Array<{ type: "mermaid" | "text"; content: string }> {
  const parts: Array<{ type: "mermaid" | "text"; content: string }> = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", content: text.slice(last, match.index) });
    }
    parts.push({ type: "mermaid", content: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ type: "text", content: text.slice(last) });
  }
  return parts.length ? parts : [{ type: "text", content: text }];
}

function MermaidDiagram({ diagram }: { diagram: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useUiStore((s) => s.theme) === "dark";

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "loose" });
        const { svg } = await mermaid.render(`mermaid-${id}`, diagram);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [diagram, id, dark]);

  if (error) {
    return (
      <pre className="overflow-auto rounded border border-red-800 bg-red-950/30 p-3 text-xs text-red-300">
        {diagram}
        {"\n\n// Render error: "}{error}
      </pre>
    );
  }

  return <div ref={ref} className="flex justify-center overflow-auto py-2" />;
}

export function MermaidBlock({ content, className }: Props) {
  const hasMermaid = content.includes("```mermaid");
  if (!hasMermaid) {
    return (
      <pre className={className ?? "overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-neutral-200"}>
        {content}
      </pre>
    );
  }

  const parts = extractMermaidFences(content);
  return (
    <div className={className ?? "overflow-auto p-4"}>
      {parts.map((part, i) =>
        part.type === "mermaid" ? (
          <MermaidDiagram key={i} diagram={part.content} />
        ) : (
          <pre key={i} className="whitespace-pre-wrap break-words text-xs leading-5 text-neutral-200">
            {part.content}
          </pre>
        ),
      )}
    </div>
  );
}
