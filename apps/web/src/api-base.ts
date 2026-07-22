const baseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE?.trim() || "/api");
const DEFAULT_TIMEOUT_MS = 30_000;
const GET_CACHE_TTL_MS = 8_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

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

function resolveAuthHeaders(init?: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const legacyToken = localStorage.getItem("amazon_monitor_auth_token");
    if (legacyToken) {
      headers.Authorization = `Bearer ${legacyToken}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

function cacheKey(path: string, init?: RequestOptions): string | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  return `${method} ${path}`;
}

export function clearRequestCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    inflightRequests.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) responseCache.delete(key);
  }
  for (const key of inflightRequests.keys()) {
    if (key.includes(prefix)) inflightRequests.delete(key);
  }
}

export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const key = cacheKey(path, init);
  if (key) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS) {
      return cached.data as T;
    }
    const inflight = inflightRequests.get(key);
    if (inflight) {
      return inflight as Promise<T>;
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
        ...resolveAuthHeaders(init),
        ...(init?.headers ?? {})
      }
    }).then(async (response) => {
      if (!response.ok) {
        if (response.status === 401) {
          try {
            localStorage.removeItem("amazon_monitor_auth_token");
            localStorage.removeItem("amazon_monitor_session");
          } catch {
            // ignore
          }
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

    if (key) inflightRequests.set(key, requestPromise as Promise<unknown>);

    const result = await requestPromise;
    if (key) responseCache.set(key, { at: Date.now(), data: result });
    return result;

  } finally {
    clearTimeout(timeoutId);
    if (key) inflightRequests.delete(key);
  }
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(buildRequestUrl(path), {
    credentials: "include",
    headers: resolveAuthHeaders()
  });
  if (!response.ok) {
    if (response.status === 401) {
      try {
        localStorage.removeItem("amazon_monitor_auth_token");
        localStorage.removeItem("amazon_monitor_session");
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
    }
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
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
