import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ApiError } from "@/lib/api/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}
