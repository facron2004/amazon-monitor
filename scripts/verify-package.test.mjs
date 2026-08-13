import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage } from "@electron/asar";
import { describe, expect, it } from "vitest";
import { findForbiddenPackageEntries } from "./package-security-policy.mjs";

const verifyPackageScript = fileURLToPath(new URL("./verify-package.mjs", import.meta.url));

describe("packaged app security policy", () => {
  it("rejects runtime secrets, local state, logs, temporary output, and first-party sources", () => {
    const entries = [
      "\\node_modules\\@amazon-monitor\\api\\dist\\.env",
      "\\node_modules\\@amazon-monitor\\api\\dist\\.env.example",
      "\\node_modules\\@amazon-monitor\\api\\dist\\.cookie.cache",
      "\\node_modules\\@amazon-monitor\\api\\dist\\session.cookies.json",
      "\\node_modules\\@amazon-monitor\\api\\dist\\amazon-monitor.sqlite-wal",
      "\\node_modules\\@amazon-monitor\\api\\dist\\smtp.log",
      "\\node_modules\\@amazon-monitor\\api\\dist\\private-key.pem",
      "\\logs\\api.log",
      "\\tmp\\package-output.txt",
      "\\.review-package-stage\\manifest.json",
      "\\node_modules\\@amazon-monitor\\api\\src\\index.ts",
      "\\node_modules\\@amazon-monitor\\api\\dist\\index.test.js",
      "\\node_modules\\@amazon-monitor\\api\\dist\\index.js.map",
    ];

    expect(findForbiddenPackageEntries(entries)).toEqual(entries.map((entry) => `/${entry.slice(1).replaceAll("\\", "/")}`));
  });

  it("does not flag third-party source trees or ordinary cookie and credential code", () => {
    expect(findForbiddenPackageEntries([
      "\\node_modules\\cookie\\index.js",
      "\\node_modules\\cookie-signature\\index.js",
      "\\node_modules\\@openai\\agents-core\\dist\\sandbox\\shared\\credentials.js",
      "\\node_modules\\tmp\\lib\\tmp.js",
      "\\node_modules\\some-library\\src\\index.js",
      "\\node_modules\\@amazon-monitor\\api\\dist\\cookie-parser.js",
    ])).toEqual([]);
  });

  it("normalizes slash styles and catches database sidecars and certificate files", () => {
    expect(findForbiddenPackageEntries([
      "node_modules/@amazon-monitor/api/dist/data.db-shm",
      "node_modules/@amazon-monitor/api/dist/data.db-journal",
      "node_modules/@amazon-monitor/api/dist/client.key",
      "node_modules/@amazon-monitor/api/dist/client.p12",
    ])).toEqual([
      "/node_modules/@amazon-monitor/api/dist/data.db-shm",
      "/node_modules/@amazon-monitor/api/dist/data.db-journal",
      "/node_modules/@amazon-monitor/api/dist/client.key",
      "/node_modules/@amazon-monitor/api/dist/client.p12",
    ]);
  });

  it("fails for forbidden files in the package root outside app.asar", async () => {
    const fixtureParent = mkdtempSync(join(tmpdir(), "verify-package-"));
    const packageRoot = join(fixtureParent, "win-unpacked");
    const asarSource = join(fixtureParent, "asar-source");
    const asarPath = join(packageRoot, "resources", "app.asar");

    try {
      mkdirSync(asarSource, { recursive: true });
      mkdirSync(join(packageRoot, "resources"), { recursive: true });
      writeFileSync(join(asarSource, "main.js"), "module.exports = {};\n");
      await createPackage(asarSource, asarPath);

      writeFileSync(join(packageRoot, ".env"), "SECRET=fixture\n");
      mkdirSync(join(packageRoot, "outside-resources"), { recursive: true });
      writeFileSync(join(packageRoot, "outside-resources", "client.key"), "fixture\n");

      const result = spawnSync(process.execPath, [verifyPackageScript, packageRoot], {
        encoding: "utf8",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain("/.env");
      expect(result.stdout).toContain("/outside-resources/client.key");
    } finally {
      rmSync(fixtureParent, { recursive: true, force: true });
    }
  });
});
