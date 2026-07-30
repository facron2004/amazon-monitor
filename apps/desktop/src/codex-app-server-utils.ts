import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function resolveCodexExecutable(): string {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Bundled Codex OAuth currently supports Windows x64");
  }
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex-win32-x64/package.json");
  const executable = join(
    dirname(packageJson),
    "vendor",
    "x86_64-pc-windows-msvc",
    "bin",
    "codex.exe",
  );
  return executable.replace("app.asar\\", "app.asar.unpacked\\");
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
