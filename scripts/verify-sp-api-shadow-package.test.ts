import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyShadowEvidencePackage } from "./verify-sp-api-shadow-package.js";

const requiredPreflightChecks = [
  "config_window", "database_isolated", "connector_enabled", "fixture_disabled",
  "user_data_isolated", "runtime_database_binding", "backup_artifact", "sqlite_storage",
  "organization_boundary", "data_source_boundary", "commerce_store_boundary",
  "sp_api_connection", "connection_store_link", "fact_boundary",
];

describe("SP-API shadow evidence package verifier", () => {
  it("accepts a real seven-day package with complete checksums", () => {
    const fixture = createPackage();
    try {
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(true);
      expect(result.checksumFiles).toBe(6);
      expect(result.evidence?.evidenceMode).toBe("real");
      expect(result.issues).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it("rejects a missing required file", () => {
    const fixture = createPackage();
    try {
      rmSync(join(fixture.root, "signoff.md"));
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "signoff.md",
        message: "required evidence package file is missing",
      });
    } finally {
      fixture.close();
    }
  });

  it("rejects a checksum mismatch", () => {
    const fixture = createPackage();
    try {
      writeFileSync(join(fixture.root, "reconciliation.csv"), "changed\n", "utf8");
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "reconciliation.csv",
        message: "SHA-256 does not match checksums.txt",
      });
    } finally {
      fixture.close();
    }
  });

  it("rejects an incomplete or pending three-party signoff", () => {
    const fixture = createPackage();
    try {
      writeFileSync(join(fixture.root, "signoff.md"), "Product owner: signed\nData owner: pending\n", "utf8");
      writeChecksums(fixture.root);
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "signoff.md",
        message: "data owner signature must be explicitly signed or approved",
      });
      expect(result.issues).toContainEqual({
        path: "signoff.md",
        message: "release owner signature is required",
      });
    } finally {
      fixture.close();
    }
  });

  it("rejects incomplete lineage coverage and unreconciled CSV amounts", () => {
    const fixture = createPackage();
    try {
      writeFileSync(
        join(fixture.root, "run-lineage.csv"),
        "businessDate,domain,sourceId,syncRunId,jobId,checkpoint,page,status\n2026-08-03,sales_traffic,source,run,job,completed,0,success\n",
        "utf8",
      );
      writeFileSync(
        join(fixture.root, "reconciliation.csv"),
        "businessDate,currency,storeDailyAmountMinor,skuAmountMinor,unmappedAmountMinor,orders,units,status\n2026-08-03,USD,10000,9000,0,10,20,pass\n",
        "utf8",
      );
      writeChecksums(fixture.root);
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "run-lineage.csv",
        message: "must contain at least 14 data rows",
      });
      expect(result.issues).toContainEqual({
        path: "run-lineage.csv:2.sourceId",
        message: "must match preflight scope.sourceId",
      });
      expect(result.issues).toContainEqual({
        path: "run-lineage.csv:2.page",
        message: "must be a positive integer",
      });
      expect(result.issues).toContainEqual({
        path: "run-lineage.csv.2026-08-04.fba_inventory",
        message: "must contain at least one successful lineage row",
      });
      expect(result.issues).toContainEqual({
        path: "reconciliation.csv:2",
        message: "storeDailyAmountMinor must equal skuAmountMinor + unmappedAmountMinor",
      });
      expect(result.issues).toContainEqual({
        path: "reconciliation.csv:2.skuAmountMinor",
        message: "must match evidence.json daily sales summary",
      });
    } finally {
      fixture.close();
    }
  });

  it("rejects missing or mismatched preflight scope metadata", () => {
    const missingScope = createPackage();
    try {
      const preflightPath = join(missingScope.root, "preflight.json");
      const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as Record<string, unknown>;
      delete preflight.scope;
      writeFileSync(preflightPath, JSON.stringify(preflight, null, 2), "utf8");
      writeChecksums(missingScope.root);
      const result = verifyShadowEvidencePackage(missingScope.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "preflight.json.scope",
        message: "preflight scope metadata is required",
      });
    } finally {
      missingScope.close();
    }

    const mismatchedScope = createPackage();
    try {
      const preflightPath = join(mismatchedScope.root, "preflight.json");
      const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as Record<string, unknown>;
      const scope = preflight.scope as Record<string, unknown>;
      scope.currency = "EUR";
      writeFileSync(preflightPath, JSON.stringify(preflight, null, 2), "utf8");
      writeChecksums(mismatchedScope.root);
      const result = verifyShadowEvidencePackage(mismatchedScope.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "preflight.json.scope.currency",
        message: "must match evidence.json.currency",
      });
    } finally {
      mismatchedScope.close();
    }

    const mismatchedSource = createPackage();
    try {
      const preflightPath = join(mismatchedSource.root, "preflight.json");
      const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as Record<string, unknown>;
      const scope = preflight.scope as Record<string, unknown>;
      scope.sourceId = "other-source-redacted";
      writeFileSync(preflightPath, JSON.stringify(preflight, null, 2), "utf8");
      writeChecksums(mismatchedSource.root);
      const result = verifyShadowEvidencePackage(mismatchedSource.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "preflight.json.scope.sourceId",
        message: "must match evidence.json.days[*].sourceId",
      });
    } finally {
      mismatchedSource.close();
    }
  });

  it("rejects preflight evidence without storage thresholds", () => {
    const fixture = createPackage();
    try {
      const preflightPath = join(fixture.root, "preflight.json");
      const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as Record<string, unknown>;
      preflight.storage = null;
      writeFileSync(preflightPath, JSON.stringify(preflight, null, 2), "utf8");
      writeChecksums(fixture.root);
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "preflight.json.storage",
        message: "SQLite storage snapshot and thresholds are required",
      });
    } finally {
      fixture.close();
    }
  });

  it("rejects credential-like content and raw credential files", () => {
    const fixture = createPackage();
    try {
      writeFileSync(join(fixture.root, "notes.txt"), "Authorization: Bearer test-secret\n", "utf8");
      writeFileSync(join(fixture.root, "credentials.env"), "SMTP_PASS=not-a-real-secret\n", "utf8");
      const result = verifyShadowEvidencePackage(fixture.root);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual({
        path: "notes.txt",
        message: "credential-like value is forbidden in evidence package",
      });
      expect(result.issues).toContainEqual({
        path: "credentials.env",
        message: "raw database, credential, key, or environment file is forbidden",
      });
    } finally {
      fixture.close();
    }
  });
});

function createPackage() {
  const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-package-"));
  const evidence = JSON.parse(readFileSync(
    new URL("./fixtures/sp-api-shadow-evidence.example.json", import.meta.url),
    "utf8",
  )) as Record<string, unknown>;
  evidence.evidenceMode = "real";
  if (Array.isArray(evidence.days)) {
    for (const day of evidence.days) {
      if (day && typeof day === "object" && !Array.isArray(day)) {
        const externalReference = (day as Record<string, unknown>).externalReference;
        if (externalReference && typeof externalReference === "object" && !Array.isArray(externalReference)) {
          (externalReference as Record<string, unknown>).sha256 = "a".repeat(64);
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
  writeFileSync(join(root, "README.md"), "Real store shadow evidence package.\n", "utf8");
  writeFileSync(join(root, "preflight.json"), JSON.stringify(buildPreflight(), null, 2), "utf8");
  writeFileSync(join(root, "evidence.json"), JSON.stringify(evidence, null, 2), "utf8");
  writeValidLineage(root);
  writeValidReconciliation(root);
  writeFileSync(join(root, "signoff.md"), "Product owner: signed\nData owner: signed\nRelease owner: signed\n", "utf8");
  writeChecksums(root);
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
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
    userData: {
      shadowPath: "C:/shadow/userData",
      productionPath: "C:/production/userData",
    },
    backup: {
      path: "C:/shadow/backups/amazon-monitor.sqlite",
      sha256: "a".repeat(64),
      bytes: 8192,
      tableCount: 68,
      integrityCheck: "ok",
    },
    checks: requiredPreflightChecks.map((name) => ({ name, ok: true, detail: "ok" })),
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

function writeChecksums(root: string): void {
  const files = [
    "README.md", "preflight.json", "evidence.json", "run-lineage.csv", "reconciliation.csv", "signoff.md",
  ];
  const lines = files.map((file) => {
    const hash = createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
    return `${hash}  ${file}`;
  });
  writeFileSync(join(root, "checksums.txt"), `${lines.join("\n")}\n`, "utf8");
}
