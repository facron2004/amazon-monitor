import { URL } from "node:url";

export interface ParsedProxy {
  server: string;
  username?: string;
  password?: string;
}

export interface ProxyItem {
  url: string;
  failures: number;
  lastUsed: number;
}

export class ProxyPool {
  private static instance: ProxyPool | null = null;

  private staticProxies: ProxyItem[] = [];
  private maxFailures = 3;
  private proxyApiUrl: string | null = null;
  private currentApiProxy: string | null = null;

  private constructor() {
    this.maxFailures = Number(process.env.AMAZON_COLLECT_PROXY_MAX_FAILURES ?? 3);
    this.proxyApiUrl = process.env.AMAZON_COLLECT_PROXY_API ?? null;
    const staticProxiesStr = process.env.AMAZON_COLLECT_PROXIES;
    if (staticProxiesStr) {
      this.staticProxies = staticProxiesStr
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((url) => ({
          url,
          failures: 0,
          lastUsed: 0
        }));
    }
  }

  public static getInstance(): ProxyPool {
    if (!this.instance) {
      this.instance = new ProxyPool();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    this.instance = null;
  }

  /**
   * Get parsed proxy config for Playwright launch options
   */
  public async getProxy(): Promise<ParsedProxy | null> {
    // 1. Try static proxy pool if available
    const activeStaticProxies = this.staticProxies.filter((p) => p.failures < this.maxFailures);
    if (activeStaticProxies.length > 0) {
      // Sort by lastUsed (least recently used)
      activeStaticProxies.sort((a, b) => a.lastUsed - b.lastUsed);
      const chosen = activeStaticProxies[0];
      chosen.lastUsed = Date.now();
      return this.parseProxyUrl(chosen.url);
    }

    // 2. Try dynamic API proxy if configured
    if (this.proxyApiUrl) {
      if (!this.currentApiProxy) {
        try {
          this.currentApiProxy = await this.fetchDynamicProxy();
        } catch (error) {
          console.error(`[ProxyPool] Failed to fetch proxy from API:`, error);
          return null;
        }
      }
      if (this.currentApiProxy) {
        return this.parseProxyUrl(this.currentApiProxy);
      }
    }

    return null;
  }

  /**
   * Mark a proxy URL as failed so it rotates/retries
   */
  public reportFailure(proxyUrl: string): void {
    // Check if it matches static proxy
    const found = this.staticProxies.find((p) => p.url === proxyUrl);
    if (found) {
      found.failures++;
      console.warn(`[ProxyPool] Static proxy failed. Failure count: ${found.failures}/${this.maxFailures} for ${proxyUrl}`);
      return;
    }

    // Check if it matches dynamic proxy
    if (this.currentApiProxy === proxyUrl) {
      console.warn(`[ProxyPool] Dynamic API proxy failed: ${proxyUrl}. Discarding cache.`);
      this.currentApiProxy = null;
    }
  }

  /**
   * Reset all failures (e.g. at the start of a new collection sweep)
   */
  public resetFailures(): void {
    for (const p of this.staticProxies) {
      p.failures = 0;
    }
    this.currentApiProxy = null;
  }

  private async fetchDynamicProxy(): Promise<string | null> {
    if (!this.proxyApiUrl) return null;
    const res = await fetch(this.proxyApiUrl);
    if (!res.ok) {
      throw new Error(`Proxy API returned status ${res.status}`);
    }
    const text = (await res.text()).trim();
    if (!text) {
      throw new Error("Proxy API returned empty response");
    }

    // Check if response is JSON (like { "proxy": "http://..." })
    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object") {
        const url = json.proxy || json.ip || json.url;
        if (url) return String(url);
      }
    } catch {
      // Not JSON, treat as raw proxy string
    }

    return text.startsWith("http") ? text : `http://${text}`;
  }

  private parseProxyUrl(proxyStr: string): ParsedProxy | null {
    try {
      const url = new URL(proxyStr);
      const server = `${url.protocol}//${url.host}`;
      const username = url.username ? decodeURIComponent(url.username) : undefined;
      const password = url.password ? decodeURIComponent(url.password) : undefined;
      return { server, username, password };
    } catch {
      // If it doesn't parse, maybe it's just host:port
      if (/^[a-zA-Z0-9.-]+:\d+$/.test(proxyStr)) {
        return { server: `http://${proxyStr}` };
      }
      return { server: proxyStr };
    }
  }
}
