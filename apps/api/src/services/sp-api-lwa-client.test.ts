import { describe, expect, it } from "vitest";
import { SpApiConnectorError } from "./sp-api-errors.js";
import { SpApiLwaTokenCache, type SpApiLwaTokenRequest } from "./sp-api-lwa-client.js";

const tokenRequest: SpApiLwaTokenRequest = {
  dataSourceId: 7,
  credentialVersion: 1,
  region: "EU",
  credentials: {
    lwaClientId: "amzn1.application-oa2-client.test",
    lwaClientSecret: "client-secret",
    lwaRefreshToken: "Atzr|refresh-token"
  }
};

describe("SP-API LWA token cache", () => {
  it("caches a valid token and refreshes when it enters the safety window", async () => {
    let calls = 0;
    let now = 1_000_000;
    const cache = new SpApiLwaTokenCache(async () => {
      calls++;
      return response({ access_token: `token-${calls}`, expires_in: 120 });
    }, () => now, 60_000);

    expect((await cache.get(tokenRequest)).accessToken).toBe("token-1");
    expect((await cache.get(tokenRequest)).accessToken).toBe("token-1");
    now += 61_000;
    expect((await cache.get(tokenRequest)).accessToken).toBe("token-2");
    expect(calls).toBe(2);
  });

  it("uses one in-flight token refresh for concurrent callers", async () => {
    let calls = 0;
    let resolveResponse: ((value: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const cache = new SpApiLwaTokenCache(async () => {
      calls++;
      return deferred;
    });

    const first = cache.get(tokenRequest);
    const second = cache.get(tokenRequest);
    expect(calls).toBe(1);
    resolveResponse?.(response({ access_token: "singleflight-token", expires_in: 3600 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accessToken: "singleflight-token" }),
      expect.objectContaining({ accessToken: "singleflight-token" })
    ]);
  });

  it("separates credential versions and classifies revoked refresh tokens without revealing them", async () => {
    let calls = 0;
    const cache = new SpApiLwaTokenCache(async () => {
      calls++;
      return response({ access_token: `token-${calls}`, expires_in: 3600 });
    });

    await cache.get(tokenRequest);
    await cache.get({ ...tokenRequest, credentialVersion: 2 });
    expect(calls).toBe(2);

    const rejected = new SpApiLwaTokenCache(async () => response({ error: "invalid_grant" }, 400));
    await expect(rejected.get(tokenRequest)).rejects.toMatchObject<Partial<SpApiConnectorError>>({
      category: "credentials_revoked",
      retryable: false
    });
  });
});

function response(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
