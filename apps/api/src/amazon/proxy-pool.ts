import { URL } from "node:url";
import { intEnv } from "./config.js";

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
  private currentStaticProxy: string | null = null;

  private constructor() {
    this.maxFailures = intEnv("AMAZON_COLLECT_PROXY_MAX_FAILURES", 3, 1, 20);
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
    const staticProxy = this.getNextStaticProxy();
    if (staticProxy) {
      this.currentStaticProxy = staticProxy.url;
      staticProxy.lastUsed = Date.now();
      return this.parseProxyUrl(staticProxy.url);
    }

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
    const staticProxy = this.staticProxies.find((p) => p.url === proxyUrl || this.parseProxyUrl(p.url)?.server === proxyUrl);
    if (staticProxy) {
      staticProxy.failures += 1;
      console.warn(`[ProxyPool] Static proxy failed. Failure count: ${staticProxy.failures}/${this.maxFailures} for ${proxyUrl}`);
      if (this.currentStaticProxy === staticProxy.url) {
        this.currentStaticProxy = null;
      }
      return;
    }

    if (this.currentApiProxy && this.matchesProxy(this.currentApiProxy, proxyUrl)) {
      console.warn(`[ProxyPool] Dynamic API proxy failed: ${proxyUrl}. Discarding cache.`);
      this.currentApiProxy = null;
    }
  }

  /**
   * Reset all failures (e.g. at the start of a new collection sweep)
   */
  public resetFailures(): void {
    for (const proxy of this.staticProxies) {
      proxy.failures = 0;
    }
    this.currentApiProxy = null;
    this.currentStaticProxy = null;
  }

  private getNextStaticProxy(): ProxyItem | null {
    const activeStaticProxies = this.staticProxies.filter((proxy) => proxy.failures < this.maxFailures);
    if (activeStaticProxies.length === 0) {
      return null;
    }

    activeStaticProxies.sort((a, b) => a.lastUsed - b.lastUsed);
    return activeStaticProxies[0] ?? null;
  }

  private matchesProxy(configuredProxy: string, reportedProxyUrl: string): boolean {
    return configuredProxy === reportedProxyUrl || this.parseProxyUrl(configuredProxy)?.server === reportedProxyUrl;
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
      if (/^[a-zA-Z0-9.-]+:\d+$/.test(proxyStr)) {
        return { server: `http://${proxyStr}` };
      }
      return { server: proxyStr };
    }
  }
}
