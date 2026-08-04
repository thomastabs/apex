import type { AuthContext, RequestContext } from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  /** Stable machine code from the backend (`detail: {code, message}`), when it
   *  sent one. Lets the client classify a failure exactly instead of pattern-
   *  matching prose. Absent for the many routes that still return a bare
   *  string detail - classification falls back to the status code there. */
  code?: string;

  constructor(status: number, detail: unknown) {
    super(ApiError.messageFor(status, detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    const code = ApiError.codeFor(detail);
    if (code) this.code = code;
  }

  private static codeFor(detail: unknown): string | undefined {
    if (detail && typeof detail === "object" && "code" in detail && typeof detail.code === "string") {
      return detail.code;
    }
    return undefined;
  }

  private static messageFor(status: number, detail: unknown): string {
    if (typeof detail === "string" && detail) return detail;
    // Structured detail: `{code, message}` from the backend's typed errors.
    if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string" && detail.message) {
      return detail.message;
    }
    // FastAPI's own request-validation 422s shape `detail` as a list of
    // {loc, msg, type} objects rather than a string — surface the actual
    // field errors instead of falling through to the generic message below.
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const msg = "msg" in d && typeof d.msg === "string" ? d.msg : null;
          if (!msg) return null;
          const loc = "loc" in d && Array.isArray(d.loc) ? d.loc.filter((p: unknown) => p !== "body").join(".") : "";
          return loc ? `${loc}: ${msg}` : msg;
        })
        .filter((m): m is string => Boolean(m));
      if (messages.length) return messages.join("; ");
    }
    // 429 bodies are often opaque upstream payloads (e.g. Figma's {err:...}) with
    // no `detail` string — show a human message instead of the raw status.
    if (status === 429) return "Too many requests — please wait a moment and try again.";
    return `API request failed with status ${status}`;
  }
}

/** The request never reached the backend - offline, DNS failure, CORS, backend down. */
export class ApiNetworkError extends ApiError {
  constructor(cause?: unknown) {
    super(0, "Could not reach the server.");
    this.name = "ApiNetworkError";
    this.cause = cause;
  }
}

/** The client-side deadline fired before the backend answered. Distinct from a
 *  user-initiated cancel: this one MUST surface a toast. */
export class ApiTimeoutError extends ApiError {
  timeoutMs: number;
  path: string;

  constructor(timeoutMs: number, path: string) {
    super(0, `The request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
    this.path = path;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Marker put on the AbortController's reason so a deadline abort can be told
 *  apart from the caller's own cancel (which shares the AbortError name). */
const TIMEOUT_REASON = Symbol.for("apex.api.timeout");

function isTimeoutReason(reason: unknown): boolean {
  return Boolean(reason && typeof reason === "object" && TIMEOUT_REASON in reason);
}

function getErrorDetail(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "detail" in payload) {
    return payload.detail;
  }
  return payload;
}

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
}

/** Auth/context headers for a request (Bearer token + project + Taiga URL). Shared
 *  by apiRequest and the streaming fetch in the autopilot hook. */
export function contextHeaders(context?: RequestContext | AuthContext | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (context?.taigaToken) {
    headers.Authorization = `Bearer ${context.taigaToken}`;
  }
  if (context?.taigaApiUrl) {
    // Send the caller's own known Taiga base as an override header so the
    // backend anchors identity/project checks to it instead of trusting the
    // shared workspace config alone (audit H4).
    headers["X-Taiga-Url"] = context.taigaApiUrl;
  }
  if (context && "projectId" in context && context.projectId) {
    headers["X-Project-Id"] = String(context.projectId);
    headers["X-Taiga-Project-Id"] = String(context.projectId);
  }
  return headers;
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  context?: RequestContext | AuthContext | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  // Extra request headers (e.g. X-Figma-Token for the Figma proxy). Merged last.
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, context, timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers: extraHeaders }: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  // Abort with a tagged reason so the catch below can tell "we ran out of time"
  // (must surface an error) from "the caller cancelled" (must stay silent).
  const timeout = globalThis.setTimeout(
    () => controller.abort(Object.assign(new Error("timeout"), { [TIMEOUT_REASON]: true })),
    timeoutMs,
  );
  // Chain external abort signal so callers can cancel mid-flight
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...contextHeaders(context),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (isTimeoutReason(controller.signal.reason)) {
      throw new ApiTimeoutError(timeoutMs, path);
    }
    // The caller's own cancel - rethrow untouched so useCancellableMutation
    // can recognise and swallow it.
    if (signal?.aborted) throw err;
    // fetch() rejects with a bare TypeError for offline/DNS/CORS failures.
    if (err instanceof TypeError) throw new ApiNetworkError(err);
    throw err;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;
  try {
    payload = contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    // A truncated or malformed body must not escape as a raw SyntaxError - the
    // status is the useful part, so report it as a normal ApiError.
    if (!response.ok) throw new ApiError(response.status, null);
    throw new ApiError(response.status, "The server returned a malformed response.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, getErrorDetail(payload));
  }

  return payload as T;
}
