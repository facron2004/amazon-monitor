import type { SpApiRegion } from "@amazon-monitor/shared";
import type { SpApiCredentials } from "./sp-api-credentials.js";
import { retryAfterMsFromHeader, SpApiConnectorError } from "./sp-api-errors.js";

const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const DEFAULT_SAFETY_SKEW_MS = 60_000;

export interface SpApiLwaTokenRequest {
  dataSourceId: number;
  credentialVersion: number;
  region: SpApiRegion;
  credentials: SpApiCredentials;
}

export interface SpApiLwaAccessToken {
  accessToken: string;
  expiresAt: number;
}

export type SpApiFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface LwaTokenPayload {
  access_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
}

/**
 * Process-local access-token cache. The caller must clear the source after
 * replacing or disconnecting credentials; refresh tokens never enter this
 * cache or its key.
 */
export class SpApiLwaTokenCache {
  private readonly cached = new Map<string, SpApiLwaAccessToken>();
  private readonly inFlight = new Map<string, Promise<SpApiLwaAccessToken>>();
  private readonly invalidationVersions = new Map<number, number>();

  constructor(
    private readonly request: SpApiFetch = (input, init) => globalThis.fetch(input, init),
    private readonly now: () => number = Date.now,
    private readonly safetySkewMs = DEFAULT_SAFETY_SKEW_MS,
    private readonly tokenEndpoint = LWA_TOKEN_ENDPOINT
  ) {}

  async get(request: SpApiLwaTokenRequest): Promise<SpApiLwaAccessToken> {
    const key = cacheKey(request);
    const cached = this.cached.get(key);
    if (cached && cached.expiresAt - this.now() > this.safetySkewMs) {
      return cached;
    }
    const inFlight = this.inFlight.get(key);
    if (inFlight) return inFlight;

    const invalidationVersion = this.ensureInvalidationVersion(request.dataSourceId);
    const refresh = this.refresh(request, key, invalidationVersion);
    this.inFlight.set(key, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlight.get(key) === refresh) this.inFlight.delete(key);
    }
  }

  clearDataSource(dataSourceId: number): void {
    this.invalidationVersions.set(dataSourceId, this.invalidationVersion(dataSourceId) + 1);
    const prefix = `${dataSourceId}:`;
    for (const key of this.cached.keys()) {
      if (key.startsWith(prefix)) this.cached.delete(key);
    }
    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) this.inFlight.delete(key);
    }
  }

  clearAll(): void {
    this.cached.clear();
    this.inFlight.clear();
    for (const dataSourceId of this.invalidationVersions.keys()) {
      this.invalidationVersions.set(dataSourceId, this.invalidationVersion(dataSourceId) + 1);
    }
  }

  private async refresh(
    input: SpApiLwaTokenRequest,
    key: string,
    invalidationVersion: number,
  ): Promise<SpApiLwaAccessToken> {
    let response: Response;
    try {
      response = await this.request(this.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: input.credentials.lwaRefreshToken,
          client_id: input.credentials.lwaClientId,
          client_secret: input.credentials.lwaClientSecret
        }).toString(),
        signal: AbortSignal.timeout(20_000)
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new SpApiConnectorError("network_timeout", "LWA token request timed out", true);
      }
      throw new SpApiConnectorError("network_timeout", "LWA token request could not be completed", true);
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      if (response.status === 400 && payload.error === "invalid_grant") {
        throw new SpApiConnectorError("credentials_revoked", "LWA refresh token was rejected", false);
      }
      if (response.status === 400 || response.status === 401) {
        throw new SpApiConnectorError("credentials_invalid", "LWA credentials were rejected", false);
      }
      if (response.status === 429) {
        throw new SpApiConnectorError(
          "rate_limited",
          "LWA token endpoint is rate limited",
          true,
          retryAfterMsFromHeader(response.headers.get("retry-after"), this.now())
        );
      }
      if (response.status >= 500) {
        throw new SpApiConnectorError(
          "amazon_5xx",
          "LWA token endpoint is unavailable",
          true,
          retryAfterMsFromHeader(response.headers.get("retry-after"), this.now())
        );
      }
      throw new SpApiConnectorError("unknown", "LWA token request failed", false);
    }

    const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
    const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : null;
    if (!accessToken || !expiresIn || expiresIn <= 0) {
      throw new SpApiConnectorError("schema_invalid", "LWA token response was invalid", false);
    }
    if (this.invalidationVersion(input.dataSourceId) !== invalidationVersion) {
      throw new SpApiConnectorError("credentials_invalid", "SP-API token refresh was invalidated", false);
    }
    const token = { accessToken, expiresAt: this.now() + Math.floor(expiresIn * 1_000) };
    this.cached.set(key, token);
    return token;
  }

  private invalidationVersion(dataSourceId: number): number {
    return this.invalidationVersions.get(dataSourceId) ?? 0;
  }

  private ensureInvalidationVersion(dataSourceId: number): number {
    const current = this.invalidationVersion(dataSourceId);
    if (!this.invalidationVersions.has(dataSourceId)) {
      this.invalidationVersions.set(dataSourceId, current);
    }
    return current;
  }
}

export const spApiLwaTokenCache = new SpApiLwaTokenCache();

function cacheKey(input: SpApiLwaTokenRequest): string {
  return `${input.dataSourceId}:${input.credentialVersion}:${input.region}`;
}

async function readPayload(response: Response): Promise<LwaTokenPayload> {
  try {
    const payload: unknown = await response.json();
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload as LwaTokenPayload
      : {};
  } catch {
    return {};
  }
}
