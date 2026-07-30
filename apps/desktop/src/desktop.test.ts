import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSecureWebPreferences,
  isAllowedRendererUrl,
} from "./browser-security.js";
import {
  createDesktopPaths,
  findLegacyDatabase,
  migrateLegacyDatabase,
} from "./desktop-paths.js";
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
  it("selects the first non-empty legacy database outside the target path", () => {
    const root = temporaryDirectory();
    const empty = join(root, "empty.sqlite");
    const legacy = join(root, "legacy.sqlite");
    const target = join(root, "user-data", "data", "amazon-monitor.sqlite");
    writeFileSync(empty, "");
    const database = new DatabaseSync(legacy);
    database.exec("CREATE TABLE marker (value TEXT)");
    database.close();

    expect(findLegacyDatabase([
      undefined,
      empty,
      target,
      legacy,
      legacy,
    ], target)).toBe(legacy);
  });

  it("copies and verifies a legacy database without deleting the source", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));
    const database = new DatabaseSync(legacy);
    database.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('ok')");
    database.close();

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("ok");
    expect(readMarker(`${paths.database}.legacy-backup`)).toBe("ok");
    expect(existsSync(`${paths.database}.migrating-wal`)).toBe(false);
    expect(existsSync(`${paths.database}.migrating-shm`)).toBe(false);
    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("skipped");
  });

  it("includes committed rows that are still present in a WAL file", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));
    const database = new DatabaseSync(legacy);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA wal_autocheckpoint = 0;
      CREATE TABLE marker (value TEXT);
      INSERT INTO marker VALUES ('from-wal');
    `);

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("from-wal");
    expect(readMarker(`${paths.database}.legacy-backup`)).toBe("from-wal");
    database.close();
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

function readMarker(path: string): string | undefined {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return database.prepare("SELECT value FROM marker").get()?.value as
      | string
      | undefined;
  } finally {
    database.close();
  }
}
