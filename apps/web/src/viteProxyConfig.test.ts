import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { resolveConfig, type ProxyOptions } from "vite";
import { resolveApiProxyTarget } from "./utils/viteProxyTarget";

const require = createRequire(import.meta.url);

function isProxyOptions(proxy: string | ProxyOptions | undefined): proxy is ProxyOptions {
  return typeof proxy === "object" && proxy !== null;
}

describe("vite dev API proxy", () => {
  it("defaults the API proxy to the local backend port", () => {
    expect(resolveApiProxyTarget({})).toBe("http://127.0.0.1:4000");
  });

  it("allows an explicit API proxy target and trims trailing slashes", () => {
    expect(resolveApiProxyTarget({ VITE_DEV_API_PROXY_TARGET: " http://127.0.0.1:4100/ " })).toBe(
      "http://127.0.0.1:4100"
    );
  });

  it("uses the dedicated Vite dev API port", () => {
    expect(resolveApiProxyTarget({ VITE_DEV_API_PORT: "4100" })).toBe("http://127.0.0.1:4100");
  });

  it("ignores a generic PORT so the web server port cannot become the API proxy target", () => {
    expect(resolveApiProxyTarget({ PORT: "5188" })).toBe("http://127.0.0.1:4000");
  });

  it("keeps Vite's runtime proxy dependency installed", () => {
    expect(() => require.resolve("http-proxy")).not.toThrow();
  });

  it("keeps the dev server /api proxy wired in the Vite config", async () => {
    const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
    const config = await resolveConfig({ configFile }, "serve", "development");
    const apiProxy = config.server.proxy?.["/api"];

    expect(isProxyOptions(apiProxy)).toBe(true);
    if (!isProxyOptions(apiProxy)) {
      throw new Error("Expected /api to use a Vite proxy options object");
    }

    expect(apiProxy.target).toBe("http://127.0.0.1:4000");
    expect(apiProxy.changeOrigin).toBe(true);
    expect(apiProxy.secure).toBe(false);
    expect(apiProxy.ws).toBe(true);
  });

  it("keeps the preview /api proxy wired for built web previews", async () => {
    const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
    const config = await resolveConfig({ configFile }, "serve", "development");
    const apiProxy = config.preview.proxy?.["/api"];

    expect(isProxyOptions(apiProxy)).toBe(true);
    if (!isProxyOptions(apiProxy)) {
      throw new Error("Expected preview /api to use a Vite proxy options object");
    }

    expect(apiProxy.target).toBe("http://127.0.0.1:4000");
    expect(apiProxy.changeOrigin).toBe(true);
    expect(apiProxy.secure).toBe(false);
    expect(apiProxy.ws).toBe(true);
  });
});
