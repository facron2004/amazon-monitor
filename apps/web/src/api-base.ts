import { getSessionCacheNamespace, registerSessionBoundaryListener } from "./session-boundary";

const baseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE?.trim() || "/api");
const DEFAULT_TIMEOUT_MS = 30_000;
const GET_CACHE_TTL_MS = 8_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

const responseCache = new Map<string, CacheEntry>();
interface InflightRequest {
  controller: AbortController;
  promise: Promise<unknown>;
}

const inflightRequests = new Map<string, InflightRequest>();
const activeDownloadControllers = new Set<AbortController>();

export interface RequestOptions extends RequestInit {
  /** AbortSignal for request cancellation (e.g., when switching tabs) */
  signal?: AbortSignal;
  /** Request timeout in milliseconds, defaults to 30s */
  timeoutMs?: number;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function buildRequestUrl(path: string, base = baseUrl): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedBase) {
    return normalizedPath;
  }
  if (normalizedBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${normalizedBase}${normalizedPath.slice("/api".length)}`;
  }
  return `${normalizedBase}${normalizedPath}`;
}

function cacheKey(path: string, init: RequestOptions | undefined, namespace: string): string | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  return `${namespace} ${method} ${path}`;
}

export function clearRequestCache(prefix?: string): void {
  if (!prefix) {
    for (const { controller } of inflightRequests.values()) {
      controller.abort();
    }
    for (const controller of activeDownloadControllers) {
      controller.abort();
    }
    responseCache.clear();
    inflightRequests.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) responseCache.delete(key);
  }
  for (const [key, inflight] of inflightRequests) {
    if (key.includes(prefix)) {
      inflight.controller.abort();
      inflightRequests.delete(key);
    }
  }
}

registerSessionBoundaryListener(() => clearRequestCache());

function createSessionBoundaryAbortError(): Error {
  const error = new Error("The session changed before the request completed.");
  error.name = "AbortError";
  return error;
}

function assertCurrentSession(namespace: string): void {
  if (namespace !== getSessionCacheNamespace()) {
    throw createSessionBoundaryAbortError();
  }
}

export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const namespace = getSessionCacheNamespace();
  const key = cacheKey(path, init, namespace);
  if (key) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS) {
      return cached.data as T;
    }
    const inflight = inflightRequests.get(key);
    if (inflight) {
      return inflight.promise as Promise<T>;
    }
  }

  // Build a timeout-aware AbortSignal
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller already provided a signal, forward its abort to our controller
  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener("abort", () => controller.abort(init.signal!.reason), { once: true });
    }
  }

  try {
    const requestPromise = fetch(buildRequestUrl(path), {
      ...init,
      credentials: init?.credentials ?? "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    }).then(async (response) => {
      if (!response.ok) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
        }
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message ?? response.statusText);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    });

    if (key) {
      inflightRequests.set(key, {
        controller,
        promise: requestPromise as Promise<unknown>
      });
    }

    const result = await requestPromise;
    assertCurrentSession(namespace);
    if (key) responseCache.set(key, { at: Date.now(), data: result });
    return result;

  } finally {
    clearTimeout(timeoutId);
    if (key && inflightRequests.get(key)?.controller === controller) {
      inflightRequests.delete(key);
    }
  }
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const namespace = getSessionCacheNamespace();
  const controller = new AbortController();
  activeDownloadControllers.add(controller);
  try {
    const response = await fetch(buildRequestUrl(path), {
      credentials: "include",
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
      }
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message ?? response.statusText);
    }

    const blobUrl = URL.createObjectURL(await response.blob());
    assertCurrentSession(namespace);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(blobUrl);
    }
  } finally {
    activeDownloadControllers.delete(controller);
  }
}

/**
 * Returns true when the given error is a request-cancellation error raised by
 * an AbortController. Use this in catch blocks to decide whether to swallow the
 * error silently (because a newer request superseded this one) vs surface it.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

/**
 * Helper to skip `null`/`undefined` signals and `undefined` option objects when
 * passing them through call sites. Avoids the boilerplate of:
 *   api.fetchX(args, signal ? { signal } : undefined)
 * in every callsite.
 */
export function withSignal(signal: AbortSignal | undefined): { signal: AbortSignal } | undefined {
  return signal ? { signal } : undefined;
}
