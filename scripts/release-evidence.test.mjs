import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReleaseEvidence,
  parseOutputPath,
  sha256File,
} from "./collect-release-evidence.mjs";
import { parseInputPath, verifyEvidence } from "./verify-release-evidence.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("release evidence", () => {
  it("records hashes and signatures for the current release artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const releaseRoot = join(root, "electron");
    const unpacked = join(releaseRoot, "win-unpacked");
    mkdirSync(join(unpacked, "resources"), { recursive: true });
    const mainExecutable = join(unpacked, "Amazon Monitor.exe");
    const installer = join(releaseRoot, "Amazon Monitor Setup 1.1.0.exe");
    writeFileSync(mainExecutable, "main");
    writeFileSync(installer, "installer");
    writeFileSync(`${installer}.blockmap`, "blockmap");
    writeFileSync(join(releaseRoot, "builder-debug.yml"), "builder-debug");
    writeFileSync(join(unpacked, "resources", "app.asar"), "asar");
    const signatureReader = (path) => ({ ok: true, status: "Valid", executable: path });
    const evidence = createReleaseEvidence({
      releaseRoot,
      signatureReader,
      version: "1.1.0",
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(evidence.ok).toBe(true);
    expect(evidence.generatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(evidence.artifacts).toHaveLength(5);
    expect(evidence.artifacts.find((artifact) => artifact.kind === "installer")).toMatchObject({
      exists: true,
      bytes: 9,
      sha256: createHash("sha256").update("installer").digest("hex"),
      signature: { status: "Valid" },
    });
  });

  it("marks a missing required artifact as failed and parses output paths", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const evidence = createReleaseEvidence({
      releaseRoot: join(root, "electron"),
      signatureReader: () => ({ ok: true, status: "Valid" }),
      version: "1.1.0",
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(evidence.ok).toBe(false);
    expect(evidence.artifacts.find((artifact) => artifact.kind === "unpacked")).toMatchObject({
      exists: false,
      required: true,
    });
    expect(parseOutputPath(["--output", "tmp/evidence.json"])).toMatch(/tmp[\\/]evidence\.json$/);
    expect(parseOutputPath(["--output=tmp/evidence.json"])).toMatch(/tmp[\\/]evidence\.json$/);
  });

  it("hashes a file with SHA-256", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const filePath = join(root, "artifact.bin");
    writeFileSync(filePath, "evidence");
    expect(sha256File(filePath)).toBe(createHash("sha256").update("evidence").digest("hex"));
  });

  it("verifies evidence against the current artifact bytes and signatures", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const releaseRoot = join(root, "electron");
    const unpacked = join(releaseRoot, "win-unpacked");
    mkdirSync(join(unpacked, "resources"), { recursive: true });
    writeFileSync(join(unpacked, "Amazon Monitor.exe"), "main");
    const installer = join(releaseRoot, "Amazon Monitor Setup 1.1.0.exe");
    writeFileSync(installer, "installer");
    writeFileSync(join(releaseRoot, "builder-debug.yml"), "builder-debug");
    writeFileSync(join(unpacked, "resources", "app.asar"), "asar");
    const signatureReader = () => ({ ok: true, status: "Valid" });
    const evidence = createReleaseEvidence({ releaseRoot, version: "1.1.0", signatureReader });

    expect(verifyEvidence(evidence, {
      currentVersion: "1.1.0",
      signatureReader,
    })).toMatchObject({ ok: true, errors: [] });
    const withoutInstallerSignature = {
      ...evidence,
      artifacts: evidence.artifacts.map((artifact) => {
        if (artifact.kind !== "installer") return artifact;
        const { signature, ...unsignedArtifact } = artifact;
        return unsignedArtifact;
      }),
    };
    expect(verifyEvidence(withoutInstallerSignature, {
      currentVersion: "1.1.0",
      signatureReader,
    }).errors).toContain("Signed artifact installer is missing its signature record.");
    expect(parseInputPath(["--input", "tmp/evidence.json"])).toMatch(/tmp[\\/]evidence\.json$/);
    expect(parseInputPath(["--input=tmp/evidence.json"])).toMatch(/tmp[\\/]evidence\.json$/);
  });

  it("rejects changed artifact content and signature status", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const releaseRoot = join(root, "electron");
    const unpacked = join(releaseRoot, "win-unpacked");
    mkdirSync(join(unpacked, "resources"), { recursive: true });
    const mainExecutable = join(unpacked, "Amazon Monitor.exe");
    writeFileSync(mainExecutable, "main");
    const installer = join(releaseRoot, "Amazon Monitor Setup 1.1.0.exe");
    writeFileSync(installer, "installer");
    writeFileSync(join(releaseRoot, "builder-debug.yml"), "builder-debug");
    writeFileSync(join(unpacked, "resources", "app.asar"), "asar");
    const evidence = createReleaseEvidence({
      releaseRoot,
      version: "1.1.0",
      signatureReader: () => ({ ok: true, status: "Valid" }),
    });
    writeFileSync(mainExecutable, "tampered");

    const result = verifyEvidence(evidence, {
      currentVersion: "1.1.0",
      signatureReader: () => ({ ok: false, status: "HashMismatch" }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "Artifact unpacked byte count changed.",
      "Artifact unpacked SHA-256 changed.",
      "Artifact unpacked signature status changed.",
      "Artifact unpacked signature result changed.",
    ]));
  });

  it("rejects unknown artifact shapes and paths outside the release root", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-release-evidence-"));
    temporaryRoots.push(root);
    const releaseRoot = join(root, "electron");
    const unpacked = join(releaseRoot, "win-unpacked");
    mkdirSync(join(unpacked, "resources"), { recursive: true });
    writeFileSync(join(unpacked, "Amazon Monitor.exe"), "main");
    const installer = join(releaseRoot, "Amazon Monitor Setup 1.1.0.exe");
    writeFileSync(installer, "installer");
    writeFileSync(join(releaseRoot, "builder-debug.yml"), "builder-debug");
    writeFileSync(join(unpacked, "resources", "app.asar"), "asar");
    const evidence = createReleaseEvidence({
      releaseRoot,
      version: "1.1.0",
      signatureReader: () => ({ ok: true, status: "Valid" }),
    });
    const tampered = {
      ...evidence,
      artifacts: evidence.artifacts.map((artifact) => {
        if (artifact.kind === "builder-debug") {
          return { ...artifact, path: join(root, "outside-builder-debug.yml") };
        }
        if (artifact.kind === "app-asar") {
          return { ...artifact, kind: "unexpected", required: "yes" };
        }
        return artifact;
      }),
    };

    const result = verifyEvidence(tampered, {
      currentVersion: "1.1.0",
      signatureReader: () => ({ ok: true, status: "Valid" }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "Artifact builder-debug path does not match the release root.",
      "Artifact builder-debug path must stay within the release root.",
      "Unknown artifact kind: unexpected.",
      "Artifact unexpected required flag must be boolean.",
      "Required artifact kind is missing: app-asar.",
    ]));

    const symlinkLikeResult = verifyEvidence(evidence, {
      currentVersion: "1.1.0",
      signatureReader: () => ({ ok: true, status: "Valid" }),
      fileRealpath: (filePath) => String(filePath).endsWith("builder-debug.yml")
        ? join(root, "outside-builder-debug.yml")
        : filePath,
    });
    expect(symlinkLikeResult.errors).toContain(
      "Artifact builder-debug real path must stay within the release root.",
    );
  });
});
