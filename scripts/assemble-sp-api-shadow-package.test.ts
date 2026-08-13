import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleShadowEvidencePackage } from "./assemble-sp-api-shadow-package.js";
import { verifyShadowEvidencePackage } from "./verify-sp-api-shadow-package.js";
import { SHADOW_PACKAGE_REQUIRED_PREFLIGHT_CHECKS } from "./sp-api-shadow-package-policy.js";

describe("SP-API shadow evidence package assembler", () => {
  it("creates and verifies a complete package with generated checksums", () => {
    const fixture = createSourceDirectory();
    const output = join(fixture.root, "assembled-package");
    try {
      const result = assembleShadowEvidencePackage({ sourceDirectory: fixture.source, outputDirectory: output });
      expect(result.ok).toBe(true);
      expect(result.copiedFiles).toEqual([
        "README.md", "preflight.json", "evidence.json", "run-lineage.csv", "reconciliation.csv", "signoff.md", "checksums.txt",
      ]);
      expect(result.checksumFiles).toBe(6);
      expect(verifyShadowEvidencePackage(output).ok).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it("rejects a missing input without creating an output directory", () => {
    const fixture = createSourceDirectory();
    const output = join(fixture.root, "assembled-package");
    try {
      rmSync(join(fixture.source, "signoff.md"));
      const result = assembleShadowEvidencePackage({ sourceDirectory: fixture.source, outputDirectory: output });
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "signoff.md",
        message: "required source file must be a regular file and cannot be a symbolic link",
      });
      expect(() => readFileSync(output)).toThrow();
    } finally {
      fixture.close();
    }
  });

  it("refuses to overwrite an existing output directory", () => {
    const fixture = createSourceDirectory();
    const output = join(fixture.root, "assembled-package");
    mkdirSync(output);
    writeFileSync(join(output, "keep.txt"), "keep\n", "utf8");
    try {
      const result = assembleShadowEvidencePackage({ sourceDirectory: fixture.source, outputDirectory: output });
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: output,
        message: "output directory already exists; refusing to overwrite",
      });
      expect(readFileSync(join(output, "keep.txt"), "utf8")).toBe("keep\n");
    } finally {
      fixture.close();
    }
  });

  it("rejects example evidence and credential-like input before delivery", () => {
    const fixture = createSourceDirectory();
    const output = join(fixture.root, "assembled-package");
    try {
      writeFileSync(join(fixture.source, "README.md"), "SMTP_PASS=do-not-package\n", "utf8");
      const result = assembleShadowEvidencePackage({ sourceDirectory: fixture.source, outputDirectory: output });
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "README.md",
        message: "credential-like value is forbidden in package input",
      });
      expect(() => readFileSync(output)).toThrow();
    } finally {
      fixture.close();
    }

    const invalidFixture = createSourceDirectory();
    const invalidOutput = join(invalidFixture.root, "assembled-package");
    try {
      const evidencePath = join(invalidFixture.source, "evidence.json");
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
      evidence.evidenceMode = "example";
      writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
      const result = assembleShadowEvidencePackage({ sourceDirectory: invalidFixture.source, outputDirectory: invalidOutput });
      expect(result.ok).toBe(false);
      expect(result.issues.some((issue) => issue.path.startsWith("evidence.json"))).toBe(true);
      expect(() => readFileSync(invalidOutput)).toThrow();
    } finally {
      invalidFixture.close();
    }
  });
});

function createSourceDirectory() {
  const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-assembler-"));
  const source = join(root, "inputs");
  mkdirSync(source);
  const evidence = JSON.parse(readFileSync(
    new URL("./fixtures/sp-api-shadow-evidence.example.json", import.meta.url),
    "utf8",
  )) as Record<string, unknown>;
  evidence.evidenceMode = "real";
  if (Array.isArray(evidence.days)) {
    for (const day of evidence.days) {
      if (day && typeof day === "object" && !Array.isArray(day)) {
        const reference = (day as Record<string, unknown>).externalReference;
        if (reference && typeof reference === "object" && !Array.isArray(reference)) {
          (reference as Record<string, unknown>).sha256 = "a".repeat(64);
        }
        for (const domain of ["sales", "fba"] as const) {
          const summary = (day as Record<string, unknown>)[domain];
          if (summary && typeof summary === "object" && !Array.isArray(summary)) {
            (summary as Record<string, unknown>).sourceId = "source-redacted";
          }
        }
      }
    }
  }
  writeFileSync(join(source, "README.md"), "Real store shadow evidence package.\n", "utf8");
  writeFileSync(join(source, "preflight.json"), JSON.stringify(buildPreflight(), null, 2), "utf8");
  writeFileSync(join(source, "evidence.json"), JSON.stringify(evidence, null, 2), "utf8");
  writeValidLineage(source);
  writeValidReconciliation(source);
  writeFileSync(join(source, "signoff.md"), "Product owner: signed\nData owner: signed\nRelease owner: signed\n", "utf8");
  return { root, source, close: () => rmSync(root, { recursive: true, force: true }) };
}

function writeValidLineage(root: string): void {
  const rows = ["businessDate,domain,sourceId,syncRunId,jobId,checkpoint,page,status"];
  for (let day = 3; day <= 9; day += 1) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    rows.push(`${date},sales_traffic,source-redacted,run-sales-${date},job-sales-${date},completed,1,success`);
    rows.push(`${date},fba_inventory,source-redacted,run-fba-${date},job-fba-${date},completed,1,success`);
  }
  writeFileSync(join(root, "run-lineage.csv"), `${rows.join("\n")}\n`, "utf8");
}

function writeValidReconciliation(root: string): void {
  const rows = ["businessDate,currency,storeDailyAmountMinor,skuAmountMinor,unmappedAmountMinor,orders,units,status"];
  for (let day = 3; day <= 9; day += 1) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    rows.push(`${date},USD,10000,10000,0,10,20,pass`);
  }
  writeFileSync(join(root, "reconciliation.csv"), `${rows.join("\n")}\n`, "utf8");
}

function buildPreflight(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ok: true,
    databasePath: "C:/shadow/data/amazon-monitor.sqlite",
    productionDatabasePath: "C:/production/data/amazon-monitor.sqlite",
    runtimeDatabasePath: "C:/shadow/data/amazon-monitor.sqlite",
    scope: {
      evidenceBundleId: "shadow-example-2026-08-03-us-001",
      organizationId: "org-redacted",
      commerceStoreId: "store-redacted",
      sourceId: "source-redacted",
      marketplace: "US",
      currency: "USD",
      businessTimezone: "America/Los_Angeles",
      windowStart: "2026-08-03",
      windowEnd: "2026-08-09",
    },
    userData: { shadowPath: "C:/shadow/userData", productionPath: "C:/production/userData" },
    backup: { path: "C:/shadow/backups/amazon-monitor.sqlite", sha256: "a".repeat(64), bytes: 8192, tableCount: 68, integrityCheck: "ok" },
    checks: SHADOW_PACKAGE_REQUIRED_PREFLIGHT_CHECKS.map((name) => ({ name, ok: true, detail: "ok" })),
    storage: {
      snapshot: {
        path: "C:/shadow/data/amazon-monitor.sqlite",
        observedAt: "2026-08-10T08:00:00.000Z",
        journalMode: "wal",
        synchronous: 1,
        observerBusyTimeoutMs: 10000,
        pageSize: 4096,
        pageCount: 2,
        freelistCount: 0,
        walAutocheckpointPages: 1000,
        databaseBytes: 8192,
        walBytes: 0,
        shmBytes: 0,
        totalBytes: 8192,
        checkpoint: null,
      },
      health: { ok: true, issues: [], freelistRatio: 0 },
      thresholds: {
        requireWal: true,
        maxWalBytes: 512 * 1024 * 1024,
        maxTotalBytes: 1024 * 1024 * 1024,
      },
    },
  };
}
