import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-violet-600 text-white hover:bg-violet-500",
        variant === "secondary" && "bg-neutral-800 text-neutral-200 hover:bg-neutral-700",
        variant === "danger" && "bg-red-950 text-red-200 hover:bg-red-900",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded border border-neutral-700 bg-neutral-950 p-3 text-sm leading-6 text-white outline-none focus:border-violet-500",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-l-4 border-violet-500 pl-3 text-2xl font-bold text-white">
      {children}
    </h2>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border-l-4 border-violet-400 bg-violet-950/60 px-4 py-3 text-sm text-violet-100">
      {children}
    </div>
  );
}
