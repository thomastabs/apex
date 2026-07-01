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
  if (context?.pmTool !== "jira" && context?.taigaApiUrl) {
    headers["X-Taiga-Url"] = context.taigaApiUrl;
  }
  if (context && "projectId" in context && context.projectId) {
    headers["X-Project-Id"] = String(context.projectId);
    headers["X-Taiga-Project-Id"] = String(context.projectId);
  }
  if (context?.anthropicApiKey) headers["X-Anthropic-Api-Key"] = context.anthropicApiKey;
  if (context?.openaiApiKey) headers["X-Openai-Api-Key"] = context.openaiApiKey;
  if (context?.googleApiKey) headers["X-Google-Api-Key"] = context.googleApiKey;
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
