import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findDesktopEnvFile } from "./runtime-env.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true }));
});

describe("desktop runtime environment", () => {
  it("prefers the userData env file and falls back to the EXE directory", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-env-"));
    temporaryRoots.push(root);
    const userDataPath = join(root, "userData");
    const exeDirectory = join(root, "install");
    mkdirSync(userDataPath, { recursive: true });
    mkdirSync(exeDirectory, { recursive: true });
    const userDataEnv = join(userDataPath, ".env");
    const exeEnv = join(exeDirectory, ".env");
    writeFileSync(userDataEnv, "SMTP_HOST=smtp.userdata.test\n");
    writeFileSync(exeEnv, "SMTP_HOST=smtp.exe.test\n");

    const options = {
      appPath: join(root, "app.asar"),
      cwd: root,
      execPath: join(exeDirectory, "Amazon Monitor.exe"),
      isPackaged: true,
      userDataPath,
    };
    expect(findDesktopEnvFile(options)).toBe(userDataEnv);

    rmSync(userDataEnv);
    expect(findDesktopEnvFile(options)).toBe(exeEnv);
  });

  it("uses the explicit env path before packaged defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-env-"));
    temporaryRoots.push(root);
    const explicitEnv = join(root, "custom", ".env");
    mkdirSync(join(root, "custom"), { recursive: true });
    writeFileSync(explicitEnv, "SMTP_HOST=smtp.custom.test\n");

    expect(findDesktopEnvFile({
      appPath: join(root, "app.asar"),
      configuredPath: explicitEnv,
      cwd: root,
      execPath: join(root, "Amazon Monitor.exe"),
      isPackaged: true,
      userDataPath: join(root, "userData"),
    })).toBe(explicitEnv);
  });

  it("does not read a working-directory env file from a packaged app", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-env-"));
    temporaryRoots.push(root);
    const cwdEnv = join(root, ".env");
    writeFileSync(cwdEnv, "SMTP_HOST=smtp.cwd.test\n");

    expect(findDesktopEnvFile({
      appPath: join(root, "app.asar"),
      cwd: root,
      execPath: join(root, "install", "Amazon Monitor.exe"),
      isPackaged: true,
      userDataPath: join(root, "userData"),
    })).toBeUndefined();
  });

  it("keeps the working-directory env fallback for development", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-env-"));
    temporaryRoots.push(root);
    const cwdEnv = join(root, ".env");
    writeFileSync(cwdEnv, "SMTP_HOST=smtp.cwd.test\n");

    expect(findDesktopEnvFile({
      appPath: join(root, "app.asar"),
      cwd: root,
      execPath: join(root, "install", "Amazon Monitor.exe"),
      isPackaged: false,
      userDataPath: join(root, "userData"),
    })).toBe(cwdEnv);
  });
});
