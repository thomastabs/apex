"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useUiStore((s) => s.theme) === "dark";

  // Pan/zoom state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "loose" });
        const { svg } = await mermaid.render(`mermaid-${id}`, diagram);
        if (!cancelled && innerRef.current) {
          innerRef.current.innerHTML = svg;
          // Remove fixed width/height so the SVG fills its container naturally
          const svgEl = innerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.width = "100%";
            svgEl.style.height = "auto";
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [diagram, id, dark]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(5, Math.max(0.2, s - e.deltaY * 0.001)));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: translate.x, ty: translate.y };
  }, [translate]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return;
    setTranslate({
      x: dragStart.current.tx + (e.clientX - dragStart.current.mx),
      y: dragStart.current.ty + (e.clientY - dragStart.current.my),
    });
  }, []);

  const onMouseUp = useCallback(() => { dragStart.current = null; }, []);

  const reset = useCallback(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, []);

  if (error) {
    return (
      <pre className="overflow-auto rounded border border-red-800 bg-red-950/30 p-3 text-xs text-red-300">
        {diagram}
        {"\n\n// Render error: "}{error}
      </pre>
    );
  }

  return (
    <div className="relative select-none overflow-hidden" style={{ minHeight: "200px" }}>
      {/* Controls */}
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
          onClick={() => setScale((s) => Math.min(5, s + 0.2))}
          title="Zoom in"
        >+</button>
        <button
          className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
          onClick={() => setScale((s) => Math.max(0.2, s - 0.2))}
          title="Zoom out"
        >−</button>
        <button
          className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
          onClick={reset}
          title="Reset view"
        >↺</button>
        <span className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-500">
          {Math.round(scale * 100)}%
        </span>
      </div>
      {/* Panning container */}
      <div
        ref={containerRef}
        className="cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ width: "100%", height: "100%" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          ref={innerRef}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "top center",
            transition: dragStart.current ? "none" : "transform 0.05s ease-out",
            padding: "1rem",
          }}
        />
      </div>
    </div>
  );
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
