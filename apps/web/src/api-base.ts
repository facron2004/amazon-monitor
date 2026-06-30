const baseUrl = import.meta.env.VITE_API_BASE?.trim() || "/api";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions extends RequestInit {
  /** AbortSignal for request cancellation (e.g., when switching tabs) */
  signal?: AbortSignal;
  /** Request timeout in milliseconds, defaults to 30s */
  timeoutMs?: number;
}

export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const token = localStorage.getItem("amazon_monitor_auth_token");

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
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("amazon_monitor_auth_token");
        window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
      }
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message ?? response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
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
