import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSecureWebPreferences,
  isAllowedRendererUrl,
} from "./browser-security.js";
import { createDesktopPaths, migrateLegacyDatabase } from "./desktop-paths.js";
import { BoundedRestartPolicy } from "./restart-policy.js";
import { SecureApiKeyStore, type AsyncSafeStorage } from "./secure-key-store.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  temporaryPaths.splice(0).forEach((path) => rmSync(path, {
    force: true,
    recursive: true,
  }));
});

describe("desktop security", () => {
  it("keeps the renderer sandboxed behind an isolated preload", () => {
    expect(createSecureWebPreferences("preload.cjs")).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });

  it("recognizes the renderer origin when a failed navigation adds a trailing slash", () => {
    expect(isAllowedRendererUrl(
      "http://127.0.0.1:43210/",
      "http://127.0.0.1:43210",
    )).toBe(true);
  });

  it("encrypts the API key and never stores plaintext", async () => {
    const root = temporaryDirectory();
    const encryptedPath = join(root, "secret.bin");
    const safeStorage: AsyncSafeStorage = {
      decryptStringAsync: vi.fn(async (value: Buffer) => ({
        result: Buffer.from(value.toString(), "base64").toString(),
        shouldReEncrypt: false,
      })),
      encryptStringAsync: vi.fn(async (value: string) =>
        Buffer.from(Buffer.from(value).toString("base64"))),
      isAsyncEncryptionAvailable: vi.fn(async () => true),
    };
    const store = new SecureApiKeyStore(safeStorage, encryptedPath);

    await store.set("sk-example");

    expect(readFileSync(encryptedPath, "utf8")).not.toContain("sk-example");
    expect(await store.get()).toBe("sk-example");
  });
});

describe("desktop data migration", () => {
  it("copies and verifies a legacy database without deleting the source", () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));
    const database = new DatabaseSync(legacy);
    database.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('ok')");
    database.close();

    expect(migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readFileSync(legacy)).toEqual(readFileSync(paths.database));
    expect(readFileSync(`${paths.database}.legacy-backup`)).toEqual(readFileSync(legacy));
    expect(migrateLegacyDatabase(legacy, paths.database)).toBe("skipped");
  });
});

describe("utility process restart policy", () => {
  it("limits repeated crashes per process", () => {
    const policy = new BoundedRestartPolicy(2, 60_000);

    expect(policy.recordFailure("api", 0).restart).toBe(true);
    expect(policy.recordFailure("api", 1).restart).toBe(true);
    expect(policy.recordFailure("api", 2).restart).toBe(false);
    expect(policy.recordFailure("agent", 2).restart).toBe(true);
  });
});

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "amazon-monitor-desktop-"));
  temporaryPaths.push(path);
  return path;
}
