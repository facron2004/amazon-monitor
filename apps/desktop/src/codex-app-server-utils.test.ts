import { describe, expect, it } from "vitest";
import { resolveCodexTarget } from "./codex-app-server-utils.js";

describe("Codex platform target resolution", () => {
  it("resolves the Windows x64 target", () => {
    expect(resolveCodexTarget("win32", "x64")).toEqual({
      executableName: "codex.exe",
      packageName: "@openai/codex-win32-x64",
      targetTriple: "x86_64-pc-windows-msvc",
    });
  });

  it("resolves the macOS ARM64 target", () => {
    expect(resolveCodexTarget("darwin", "arm64")).toEqual({
      executableName: "codex",
      packageName: "@openai/codex-darwin-arm64",
      targetTriple: "aarch64-apple-darwin",
    });
  });

  it("resolves the macOS Intel target", () => {
    expect(resolveCodexTarget("darwin", "x64")).toEqual({
      executableName: "codex",
      packageName: "@openai/codex-darwin-x64",
      targetTriple: "x86_64-apple-darwin",
    });
  });

  it("rejects unsupported desktop targets", () => {
    expect(() => resolveCodexTarget("linux", "x64")).toThrow("supports Windows x64 and macOS x64/arm64");
  });
});
