import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { isSignatureRequired, verifySignature } from "./verify-signature.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveReleaseArtifacts(
  version,
  releaseRoot = join(projectRoot, "release", "electron"),
) {
  return {
    unpacked: join(releaseRoot, "win-unpacked", "Amazon Monitor.exe"),
    installer: join(releaseRoot, `Amazon Monitor Setup ${version}.exe`),
  };
}

export function readDesktopVersion() {
  const packagePath = join(projectRoot, "apps", "desktop", "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`Desktop package version is missing: ${packagePath}`);
  }
  return packageJson.version;
}

function isMainModule() {
  return process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  const installerRequired = process.argv.includes("--installer")
    || String(process.env.REQUIRE_INSTALLER_SIGNATURE ?? "").trim().toLowerCase() === "true";
  const version = readDesktopVersion();
  const artifacts = resolveReleaseArtifacts(version);
  const paths = [
    { kind: "unpacked", path: artifacts.unpacked },
    ...(installerRequired ? [{ kind: "installer", path: artifacts.installer }] : []),
  ];
  const results = paths.map(({ kind, path }) => ({
    kind,
    ...verifySignature(path),
  }));
  const result = {
    ok: results.every((artifact) => artifact.ok),
    required: isSignatureRequired(),
    installerRequired,
    version,
    artifacts: results,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
