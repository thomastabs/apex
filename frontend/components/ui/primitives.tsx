"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-violet-600 text-white hover:bg-violet-500",
        variant === "secondary" && (dark
          ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          : "bg-slate-200 text-slate-700 hover:bg-slate-300"),
        variant === "danger" && "bg-red-950 text-red-200 hover:bg-red-900",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <input
      className={cn(
        "h-10 w-full rounded border px-3 text-sm outline-none transition-colors",
        dark
          ? "border-neutral-700 bg-neutral-950 text-white hover:border-neutral-500 focus:border-violet-500"
          : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <textarea
      className={cn(
        "w-full rounded border p-3 text-sm leading-6 outline-none transition-colors",
        dark
          ? "border-neutral-700 bg-neutral-950 text-white hover:border-neutral-500 focus:border-violet-500"
          : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <h2 className={cn(
      "border-l-4 border-violet-500 pl-3 text-2xl font-bold",
      dark ? "text-white" : "text-slate-900",
    )}>
      {children}
    </h2>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <div className={cn(
      "rounded border-l-4 border-violet-400 px-4 py-3 text-sm",
      dark ? "bg-violet-950/60 text-violet-100" : "bg-violet-50 text-violet-800",
    )}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <div
      className={cn(
        "animate-pulse rounded",
        dark ? "bg-neutral-800" : "bg-slate-200",
        className,
      )}
    />
  );
}
