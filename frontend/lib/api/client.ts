import type { AuthContext, RequestContext } from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
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

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  context?: RequestContext | AuthContext | null;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, context, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  // Chain external abort signal so callers can cancel mid-flight
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (context?.taigaToken) {
    headers.Authorization = `Bearer ${context.taigaToken}`;
  }
  if (context && "projectId" in context && context.projectId) {
    headers["X-Taiga-Project-Id"] = String(context.projectId);
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
