"use client";

import { toast } from "sonner";
import { classifyError, type ErrorKind } from "@/lib/errors";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/translations";

/** ErrorKind -> the `errors.<segment>.title` / `.hint` key segment. */
const KEY_SEGMENT: Record<Exclude<ErrorKind, "cancelled">, string> = {
  offline: "offline",
  timeout: "timeout",
  "auth-expired": "authExpired",
  forbidden: "forbidden",
  "not-found": "notFound",
  conflict: "conflict",
  validation: "validation",
  "rate-limited": "rateLimited",
  "ai-rate-limit": "aiRateLimit",
  "ai-timeout": "aiTimeout",
  "ai-config": "aiConfig",
  upstream: "upstream",
  server: "server",
  unknown: "unknown",
};

/** Errors stay up far longer than the sonner default (4s) — a failure that
 *  vanishes before a usability tester can read it is a failure with no
 *  feedback at all. */
const ERROR_DURATION_MS = 10_000;

export type NotifyErrorOptions = {
  /**
   * Names the operation that failed, e.g. `t("phase3.generateTasks")`. Shown as
   * "<action> failed" instead of the generic kind title, which is what makes a
   * toast diagnosable during a usability test.
   */
  action?: string;
  /** Distinguishes otherwise-identical failures so they don't collapse. */
  scope?: string;
  /**
   * Suppress a repeat of the same failure within this window. Needed for polling
   * queries (autopilot status every 1.5s, GitHub sync every 30s): a persistently
   * failing poll must report once, not once per interval. Toast `id` dedupe is
   * not enough on its own — it only merges toasts that are still on screen.
   */
  throttleMs?: number;
  /**
   * Throttle bucket, when it should differ from the toast id. The query net uses
   * the query hash here so each query throttles independently, while the toast id
   * stays keyed on the failure itself — three queries failing the same way show
   * one toast, not three identical ones.
   */
  throttleKey?: string;
};

/** Last time each throttled key was reported. Module-scoped on purpose: the
 *  window has to outlive any component that triggered the failure. */
const lastReportedAt = new Map<string, number>();

/**
 * The single error-toast entry point. Every failure — global net, hook, or call
 * site — should end up here so the wording, the hint, the duration and the
 * dedupe behaviour stay consistent.
 *
 * Returns the classified error so callers can branch on `kind` without
 * re-classifying (and so tests can assert on it).
 */
export function notifyError(err: unknown, options: NotifyErrorOptions = {}) {
  const classified = classifyError(err);

  // A deliberate cancel is not a failure — stay silent.
  if (classified.kind === "cancelled") return classified;

  const toastId = options.scope ? `${options.scope}:${classified.dedupeKey}` : classified.dedupeKey;

  if (options.throttleMs) {
    const throttleKey = options.throttleKey ? `${options.throttleKey}:${classified.dedupeKey}` : toastId;
    const now = Date.now();
    const last = lastReportedAt.get(throttleKey);
    if (last !== undefined && now - last < options.throttleMs) return classified;
    lastReportedAt.set(throttleKey, now);
  }

  const segment = KEY_SEGMENT[classified.kind];
  const title = options.action
    ? translate("errors.actionFailed", { action: options.action })
    : translate(`errors.${segment}.title` as TranslationKey);
  const hint = translate(`errors.${segment}.hint` as TranslationKey);

  // The backend's own message is the most specific thing available, so it leads;
  // the hint tells the user what to do about it. Skip the detail when it is just
  // a restatement of the title.
  const description = classified.detail && classified.detail !== title ? `${classified.detail} ${hint}` : hint;

  toast.error(title, {
    id: toastId,
    description,
    duration: ERROR_DURATION_MS,
  });

  return classified;
}

/** Test seam — clears the throttle window between cases. */
export function resetErrorToastThrottle() {
  lastReportedAt.clear();
}
