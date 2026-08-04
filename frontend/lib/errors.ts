/**
 * Single place that turns any thrown value into a user-facing error shape.
 *
 * Every failure in the app funnels through here — the global query/mutation
 * nets in `app/providers.tsx`, `useErrorToast`, and the handful of call sites
 * that still need a bespoke message. Keeping classification in one pure module
 * means a new failure mode is covered everywhere at once, instead of needing a
 * new `onError` in each of ~50 hooks.
 */

import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/client";

export type ErrorKind =
  | "offline"
  | "timeout"
  | "cancelled"
  | "auth-expired"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "validation"
  | "rate-limited"
  | "ai-rate-limit"
  | "ai-timeout"
  | "ai-config"
  | "upstream"
  | "server"
  | "unknown";

export type ClassifiedError = {
  kind: ErrorKind;
  status?: number;
  /** Stable backend code, when the backend sent a structured detail. */
  code?: string;
  /** The backend's human message, trimmed. Empty when there is nothing useful. */
  detail: string;
  /** Stable id for `toast(..., { id })` so repeats collapse into one toast. */
  dedupeKey: string;
};

/** Backend `detail.code` values that mean "the AI setup is wrong", not "the AI
 *  is busy". These get the Settings-pointing hint rather than a retry hint. */
const AI_CONFIG_CODES = new Set([
  "ai_key_missing",
  "ai_key_rejected",
  "ai_model_rejected",
  "ai_context_length",
  "ai_content_filter",
  "ai_malformed_output",
]);

const MAX_DETAIL_CHARS = 220;

function isAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? err.name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return true;
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  return /\baborted\b/i.test(message);
}

function detailOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.trim().slice(0, MAX_DETAIL_CHARS);
  if (typeof err === "string") return err.trim().slice(0, MAX_DETAIL_CHARS);
  return "";
}

function kindForStatus(status: number, code: string | undefined, detail: string): ErrorKind {
  if (code && AI_CONFIG_CODES.has(code)) return "ai-config";
  switch (status) {
    case 401:
      return "auth-expired";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 413:
      // The backend uses 413 both for an oversized request body and for an AI
      // context-window overflow; the code tells them apart.
      return code === "ai_context_length" ? "ai-config" : "validation";
    case 422:
      return "validation";
    case 429:
      return code === "ai_rate_limit" || /\bAI requests\b/i.test(detail) ? "ai-rate-limit" : "rate-limited";
    case 502:
    case 503:
      return "upstream";
    case 504:
      return "ai-timeout";
    default:
      break;
  }
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  return "unknown";
}

export function classifyError(err: unknown): ClassifiedError {
  // Deliberate cancels are checked first: an ApiTimeoutError is not an abort as
  // far as the user is concerned, so it must not be caught by this branch.
  if (!(err instanceof ApiTimeoutError) && isAbort(err)) {
    return { kind: "cancelled", detail: "", dedupeKey: "cancelled" };
  }

  if (err instanceof ApiTimeoutError) {
    return {
      kind: "timeout",
      detail: detailOf(err),
      dedupeKey: `timeout:${err.path}`,
    };
  }

  if (err instanceof ApiNetworkError) {
    return { kind: "offline", detail: "", dedupeKey: "offline" };
  }

  if (err instanceof ApiError) {
    const detail = detailOf(err);
    const kind = kindForStatus(err.status, err.code, detail);
    return {
      kind,
      status: err.status,
      code: err.code,
      detail,
      dedupeKey: `${kind}:${err.status}:${err.code ?? detail.slice(0, 40)}`,
    };
  }

  // Browsers report a lost connection on a plain fetch as `TypeError: Failed to
  // fetch`; anything not routed through apiRequest still lands here.
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return { kind: "offline", detail: "", dedupeKey: "offline" };
  }

  const detail = detailOf(err);
  return { kind: "unknown", detail, dedupeKey: `unknown:${detail.slice(0, 40)}` };
}

/** Kinds that mean "the operation never happened, and retrying now is pointless
 *  until the user changes something". Used to pick the hint copy. */
export function isActionable(kind: ErrorKind): boolean {
  return kind === "auth-expired" || kind === "forbidden" || kind === "ai-config" || kind === "validation";
}
