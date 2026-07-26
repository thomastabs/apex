import type { AuthContext, RequestContext } from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(ApiError.messageFor(status, detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  private static messageFor(status: number, detail: unknown): string {
    if (typeof detail === "string" && detail) return detail;
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

const DEFAULT_TIMEOUT_MS = 30_000;

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
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiError(response.status, getErrorDetail(payload));
    }

    return payload as T;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
