import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readDesktopVersion, resolveReleaseArtifacts } from "./verify-signatures.mjs";
import { verifySignature } from "./verify-signature.mjs";
import { sha256File } from "./collect-release-evidence.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(projectRoot, "release", "evidence", "release-evidence.json");
const REQUIRED_KINDS = ["unpacked", "installer", "builder-debug", "app-asar"];
const SIGNED_KINDS = new Set(["unpacked", "installer"]);
const KNOWN_KINDS = new Set(["unpacked", "installer", "blockmap", "builder-debug", "app-asar"]);

export function parseInputPath(args = process.argv.slice(2)) {
  const inputIndex = args.indexOf("--input");
  if (inputIndex >= 0 && args[inputIndex + 1]) {
    return resolve(projectRoot, args[inputIndex + 1]);
  }
  const equalsArgument = args.find((argument) => argument.startsWith("--input="));
  return equalsArgument
    ? resolve(projectRoot, equalsArgument.slice("--input=".length))
    : DEFAULT_INPUT;
}

function pushError(errors, message) {
  errors.push(message);
}

export function verifyEvidence(
  evidence,
  {
    currentVersion = readDesktopVersion(),
    fileExists = existsSync,
    fileStat = statSync,
    fileHash = sha256File,
    fileRealpath = realpathSync,
    signatureReader = verifySignature,
  } = {},
) {
  const errors = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, errors: ["Evidence must be a JSON object."], artifacts: [] };
  }
  if (evidence.formatVersion !== 1) {
    pushError(errors, `Unsupported evidence format version: ${String(evidence.formatVersion)}`);
  }
  if (evidence.version !== currentVersion) {
    pushError(errors, `Evidence version ${String(evidence.version)} does not match desktop version ${currentVersion}.`);
  }
  if (evidence.ok !== true) {
    pushError(errors, "Evidence was recorded as failed by the collector.");
  }
  if (!Array.isArray(evidence.artifacts)) {
    return { ok: false, errors: [...errors, "Evidence artifacts must be an array."], artifacts: [] };
  }

  if (typeof evidence.releaseRoot !== "string" || evidence.releaseRoot.length === 0) {
    pushError(errors, "Evidence releaseRoot is missing.");
  }
  const expectedPaths = {};
  if (typeof evidence.releaseRoot === "string"
    && evidence.releaseRoot.length > 0
    && typeof evidence.version === "string") {
    const releaseArtifacts = resolveReleaseArtifacts(evidence.version, evidence.releaseRoot);
    Object.assign(expectedPaths, {
      unpacked: releaseArtifacts.unpacked,
      installer: releaseArtifacts.installer,
      blockmap: `${releaseArtifacts.installer}.blockmap`,
      "builder-debug": join(evidence.releaseRoot, "builder-debug.yml"),
      "app-asar": join(dirname(releaseArtifacts.unpacked), "resources", "app.asar"),
    });
  }
  const normalizePath = (value) => process.platform === "win32"
    ? resolve(value).toLowerCase()
    : resolve(value);
  const normalizedReleaseRoot = typeof evidence.releaseRoot === "string" && evidence.releaseRoot.length > 0
    ? normalizePath(evidence.releaseRoot)
    : null;
  const isWithinPath = (root, candidate) => {
    const relativePath = relative(root, candidate);
    return relativePath === ""
      || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
  };
  const isWithinReleaseRoot = (value) => {
    if (!normalizedReleaseRoot) return false;
    const candidate = normalizePath(value);
    return isWithinPath(normalizedReleaseRoot, candidate);
  };

  const artifactKinds = new Set();
  const artifactResults = evidence.artifacts.map((artifact) => {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      pushError(errors, "An artifact record is not an object.");
      return { kind: null, ok: false };
    }
    const { kind, path: artifactPath, required = false } = artifact;
    if (typeof kind !== "string" || kind.length === 0) {
      pushError(errors, "An artifact record is missing its kind.");
    } else if (artifactKinds.has(kind)) {
      pushError(errors, `Duplicate artifact kind: ${kind}.`);
    } else {
      artifactKinds.add(kind);
    }
    if (typeof kind === "string" && !KNOWN_KINDS.has(kind)) {
      pushError(errors, `Unknown artifact kind: ${kind}.`);
    }
    if (typeof artifactPath !== "string" || artifactPath.length === 0) {
      pushError(errors, `Artifact ${String(kind)} is missing its path.`);
      return { kind: kind ?? null, ok: false };
    }
    if (typeof required !== "boolean") {
      pushError(errors, `Artifact ${String(kind)} required flag must be boolean.`);
    }
    if (expectedPaths[kind] && normalizePath(artifactPath) !== normalizePath(expectedPaths[kind])) {
      pushError(errors, `Artifact ${String(kind)} path does not match the release root.`);
    }
    if (!isWithinReleaseRoot(artifactPath)) {
      pushError(errors, `Artifact ${String(kind)} path must stay within the release root.`);
      return { kind: kind ?? null, path: artifactPath, ok: false };
    }
    if (typeof kind !== "string" || !KNOWN_KINDS.has(kind)) {
      return { kind: kind ?? null, path: artifactPath, ok: false };
    }

    let actualExists = false;
    try {
      actualExists = fileExists(artifactPath);
    } catch (error) {
      pushError(errors, `Artifact ${String(kind)} existence check failed: ${error.message}`);
      return { kind: kind ?? null, path: artifactPath, ok: false };
    }
    const result = {
      kind: kind ?? null,
      path: artifactPath,
      required: required === true,
      recordedExists: artifact.exists === true,
      actualExists,
      ok: true,
    };
    if (result.recordedExists !== actualExists) {
      pushError(errors, `Artifact ${String(kind)} existence changed.`);
      result.ok = false;
    }
    if (!actualExists) {
      if (required) {
        pushError(errors, `Required artifact is missing: ${artifactPath}`);
        result.ok = false;
      }
      return result;
    }

    try {
      const realRoot = normalizePath(fileRealpath(evidence.releaseRoot));
      const realArtifact = normalizePath(fileRealpath(artifactPath));
      if (!isWithinPath(realRoot, realArtifact)) {
        pushError(errors, `Artifact ${String(kind)} real path must stay within the release root.`);
        result.ok = false;
      }
    } catch (error) {
      pushError(errors, `Artifact ${String(kind)} real path check failed: ${error.message}`);
      result.ok = false;
    }

    try {
      const actualBytes = fileStat(artifactPath).size;
      const actualSha256 = fileHash(artifactPath);
      result.bytes = actualBytes;
      result.sha256 = actualSha256;
      if (artifact.bytes !== actualBytes) {
        pushError(errors, `Artifact ${String(kind)} byte count changed.`);
        result.ok = false;
      }
      if (String(artifact.sha256 ?? "").toLowerCase() !== String(actualSha256).toLowerCase()) {
        pushError(errors, `Artifact ${String(kind)} SHA-256 changed.`);
        result.ok = false;
      }
    } catch (error) {
      pushError(errors, `Artifact ${String(kind)} hash check failed: ${error.message}`);
      result.ok = false;
    }

    if (artifact.signature) {
      let currentSignature;
      try {
        currentSignature = signatureReader(artifactPath);
      } catch (error) {
        pushError(errors, `Artifact ${String(kind)} signature check failed: ${error.message}`);
        result.ok = false;
        return result;
      }
      result.signature = currentSignature;
      if (currentSignature.status !== artifact.signature.status) {
        pushError(errors, `Artifact ${String(kind)} signature status changed.`);
        result.ok = false;
      }
      if (currentSignature.ok !== artifact.signature.ok) {
        pushError(errors, `Artifact ${String(kind)} signature result changed.`);
        result.ok = false;
      }
    } else if (SIGNED_KINDS.has(kind)) {
      pushError(errors, `Signed artifact ${String(kind)} is missing its signature record.`);
      result.ok = false;
    }
    return result;
  });

  for (const requiredKind of REQUIRED_KINDS) {
    const artifact = evidence.artifacts.find((candidate) => candidate?.kind === requiredKind);
    if (!artifact) {
      pushError(errors, `Required artifact kind is missing: ${requiredKind}.`);
    } else if (artifact.required !== true) {
      pushError(errors, `Required artifact kind is not marked required: ${requiredKind}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    version: evidence.version,
    currentVersion,
    artifacts: artifactResults,
  };
}

function isStrict(args) {
  return args.includes("--strict")
    || String(process.env.REQUIRE_RELEASE_EVIDENCE ?? "").trim().toLowerCase() === "true";
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = parseInputPath(args);
  const evidence = JSON.parse(readFileSync(inputPath, "utf8"));
  const strict = isStrict(args);
  const signatureReader = (artifactPath) => verifySignature(artifactPath, { required: strict });
  const result = verifyEvidence(evidence, { signatureReader });
  console.log(JSON.stringify({ inputPath, strict, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
