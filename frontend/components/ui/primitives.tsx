"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

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
        FOCUS_RING,
        dark ? "focus-visible:ring-offset-neutral-900" : "focus-visible:ring-offset-white",
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
        "h-10 w-full rounded border px-3 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
        "w-full rounded border p-3 text-sm leading-6 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
    <h2 className={cn("text-2xl font-bold", dark ? "text-white" : "text-slate-900")}>
      {children}
    </h2>
  );
}

const CALLOUT_VARIANTS = {
  info: {
    icon: Info,
    dark: "bg-violet-950/60 text-violet-100",
    light: "bg-violet-50 text-violet-800",
    iconColor: "text-violet-400",
  },
  success: {
    icon: CheckCircle2,
    dark: "bg-emerald-950/60 text-emerald-100",
    light: "bg-emerald-50 text-emerald-800",
    iconColor: "text-emerald-400",
  },
  warning: {
    icon: TriangleAlert,
    dark: "bg-amber-950/40 text-amber-100",
    light: "bg-amber-50 text-amber-800",
    iconColor: "text-amber-400",
  },
  danger: {
    icon: XCircle,
    dark: "bg-red-950/50 text-red-100",
    light: "bg-red-50 text-red-800",
    iconColor: "text-red-400",
  },
} as const;

export function Callout({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: keyof typeof CALLOUT_VARIANTS;
}) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { icon: Icon, iconColor, ...tone } = CALLOUT_VARIANTS[variant];
  return (
    <div className={cn("flex gap-2.5 rounded px-4 py-3 text-sm", dark ? tone.dark : tone.light)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconColor)} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded",
        dark ? "bg-neutral-800" : "bg-slate-200",
        className,
      )}
    />
  );
}
