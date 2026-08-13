import type { WebPreferences } from "electron";

export function createSecureWebPreferences(preload: string): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    preload,
    sandbox: true,
    webSecurity: true,
  };
}

export function isAllowedRendererUrl(url: string, productionOrigin: string): boolean {
  try {
    const candidate = new URL(url);
    return candidate.origin === productionOrigin || candidate.protocol === "devtools:";
  } catch {
    return false;
  }
}

/** IPC may only be invoked by the application renderer, never by DevTools. */
export function isTrustedRendererUrl(url: string, productionOrigin: string): boolean {
  try {
    return new URL(url).origin === productionOrigin;
  } catch {
    return false;
  }
}

export async function resolveExternalUrl(
  url: string,
  rendererOrigin: string,
): Promise<string | null> {
  try {
    const candidate = new URL(url);
    if (candidate.origin === rendererOrigin) {
      if (candidate.pathname.includes("/open") || candidate.pathname.includes("/link")) {
        try {
          const response = await fetch(url, { redirect: "manual" });
          const location = response.headers.get("location");
          if (location) {
            return resolveExternalUrl(location, rendererOrigin);
          }
        } catch {
          // Ignore fetch error
        }
      }
      return null;
    }
    if (candidate.protocol === "http:" || candidate.protocol === "https:") {
      return candidate.href;
    }
  } catch {
    return null;
  }
  return null;
}
