import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readDesktopVersion, resolveReleaseArtifacts } from "./verify-signatures.mjs";
import { verifySignature } from "./verify-signature.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = join(projectRoot, "release", "evidence", "release-evidence.json");

export function sha256File(filePath, read = readFileSync) {
  return createHash("sha256").update(read(filePath)).digest("hex");
}

export function createArtifactEvidence(
  kind,
  filePath,
  { required = true, signed = false, signatureReader = verifySignature } = {},
) {
  const absolutePath = resolve(filePath);
  const exists = existsSync(absolutePath);
  const evidence = {
    kind,
    path: absolutePath,
    required,
    exists,
  };
  if (!exists) {
    return evidence;
  }
  const result = {
    ...evidence,
    bytes: statSync(absolutePath).size,
    sha256: sha256File(absolutePath),
  };
  if (signed) {
    result.signature = signatureReader(absolutePath);
  }
  return result;
}

export function createReleaseEvidence({
  version = readDesktopVersion(),
  releaseRoot,
  now = new Date(),
  signatureReader = verifySignature,
} = {}) {
  const normalizedReleaseRoot = resolve(
    releaseRoot ?? join(projectRoot, "release", "electron"),
  );
  const artifacts = resolveReleaseArtifacts(version, normalizedReleaseRoot);
  const artifactRecords = [
    createArtifactEvidence("unpacked", artifacts.unpacked, {
      signed: true,
      signatureReader,
    }),
    createArtifactEvidence("installer", artifacts.installer, {
      signed: true,
      signatureReader,
    }),
    createArtifactEvidence("blockmap", `${artifacts.installer}.blockmap`, {
      required: false,
    }),
    createArtifactEvidence("builder-debug", join(normalizedReleaseRoot, "builder-debug.yml")),
    createArtifactEvidence(
      "app-asar",
      join(dirname(artifacts.unpacked), "resources", "app.asar"),
    ),
  ];
  const requiredArtifacts = artifactRecords.filter((artifact) => artifact.required);
  const ok = requiredArtifacts.every((artifact) => (
    artifact.exists && (!artifact.signature || artifact.signature.ok)
  ));
  return {
    formatVersion: 1,
    ok,
    generatedAt: now.toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    commit: process.env.GITHUB_SHA ?? process.env.GIT_COMMIT ?? null,
    version,
    releaseRoot: normalizedReleaseRoot,
    artifacts: artifactRecords,
  };
}

export function parseOutputPath(args = process.argv.slice(2)) {
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0 && args[outputIndex + 1]) {
    return resolve(projectRoot, args[outputIndex + 1]);
  }
  const equalsArgument = args.find((argument) => argument.startsWith("--output="));
  return equalsArgument ? resolve(projectRoot, equalsArgument.slice("--output=".length)) : DEFAULT_OUTPUT;
}

function isRequired(args) {
  return args.includes("--strict")
    || String(process.env.REQUIRE_RELEASE_EVIDENCE ?? "").trim().toLowerCase() === "true";
}

function main() {
  const args = process.argv.slice(2);
  const outputPath = parseOutputPath(args);
  const evidence = createReleaseEvidence();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, ...evidence }, null, 2));
  if (!evidence.ok && isRequired(args)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
