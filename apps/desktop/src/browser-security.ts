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
