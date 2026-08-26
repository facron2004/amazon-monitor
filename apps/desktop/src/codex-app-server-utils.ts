import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

export interface CodexExecutableTarget {
  executableName: "codex" | "codex.exe";
  packageName: string;
  targetTriple: string;
}

const codexTargets: Readonly<Record<string, CodexExecutableTarget>> = {
  "win32-x64": {
    executableName: "codex.exe",
    packageName: "@openai/codex-win32-x64",
    targetTriple: "x86_64-pc-windows-msvc",
  },
  "darwin-arm64": {
    executableName: "codex",
    packageName: "@openai/codex-darwin-arm64",
    targetTriple: "aarch64-apple-darwin",
  },
  "darwin-x64": {
    executableName: "codex",
    packageName: "@openai/codex-darwin-x64",
    targetTriple: "x86_64-apple-darwin",
  },
};

export function resolveCodexTarget(
  platform: NodeJS.Platform,
  arch: string,
): CodexExecutableTarget {
  const target = codexTargets[`${platform}-${arch}`];
  if (!target) {
    throw new Error(
      `Bundled Codex OAuth currently supports Windows x64 and macOS x64/arm64; received ${platform} ${arch}`,
    );
  }
  return target;
}

export function resolveCodexExecutable(): string {
  const target = resolveCodexTarget(process.platform, process.arch);
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve(`${target.packageName}/package.json`);
  const executable = join(
    dirname(packageJson),
    "vendor",
    target.targetTriple,
    "bin",
    target.executableName,
  );
  const asarMarker = `${sep}app.asar${sep}`;
  return executable.replace(asarMarker, `${sep}app.asar.unpacked${sep}`);
}

export function nestedString(
  value: unknown,
  objectKey: string,
  valueKey: string,
): string | null {
  return isRecord(value)
    && isRecord(value[objectKey])
    && typeof value[objectKey][valueKey] === "string"
    ? value[objectKey][valueKey]
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
