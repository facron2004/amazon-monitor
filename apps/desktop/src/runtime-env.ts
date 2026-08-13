import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface DesktopEnvPathOptions {
  appPath: string;
  configuredPath?: string;
  cwd: string;
  execPath: string;
  isPackaged: boolean;
  userDataPath: string;
}

/**
 * Locate the user-owned environment file without ever bundling credentials
 * into the packaged application.
 */
export function findDesktopEnvFile(options: DesktopEnvPathOptions): string | undefined {
  const candidates = [
    options.configuredPath,
    join(options.userDataPath, ".env"),
    join(dirname(options.execPath), ".env"),
    ...(!options.isPackaged
      ? [join(options.cwd, ".env"), resolve(options.appPath, "../../.env")]
      : []),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = resolve(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (existsSync(normalized)) return normalized;
  }

  return undefined;
}
