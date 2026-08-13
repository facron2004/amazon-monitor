import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { verifyShadowEvidencePackage } from "./verify-sp-api-shadow-package.js";
import {
  containsCredentialLikeJsonField,
  containsCredentialLikeText,
  SHADOW_PACKAGE_REQUIRED_FILES,
} from "./sp-api-shadow-package-policy.js";
import type { ShadowEvidencePackageIssue } from "./verify-sp-api-shadow-package-types.js";

const INPUT_FILES = SHADOW_PACKAGE_REQUIRED_FILES.filter((file) => file !== "checksums.txt");

export interface ShadowEvidencePackageAssemblyInput {
  sourceDirectory: string;
  outputDirectory: string;
}

export interface ShadowEvidencePackageAssemblyResult {
  ok: boolean;
  packagePath: string;
  copiedFiles: string[];
  checksumFiles: number;
  issues: ShadowEvidencePackageIssue[];
}

export function assembleShadowEvidencePackage(
  input: ShadowEvidencePackageAssemblyInput,
): ShadowEvidencePackageAssemblyResult {
  const sourceDirectory = resolve(input.sourceDirectory);
  const packagePath = resolve(input.outputDirectory);
  const issues: ShadowEvidencePackageIssue[] = [];
  const sourceBuffers = new Map<string, Buffer>();

  if (sourceDirectory === packagePath) {
    issues.push({ path: packagePath, message: "source and output directories must be different" });
  }
  if (!isDirectory(sourceDirectory)) {
    issues.push({ path: sourceDirectory, message: "source directory does not exist or is not a directory" });
  }
  if (pathExists(packagePath)) {
    issues.push({ path: packagePath, message: "output directory already exists; refusing to overwrite" });
  }
  if (issues.length > 0) {
    return result(packagePath, [], issues);
  }

  for (const file of INPUT_FILES) {
    const sourcePath = join(sourceDirectory, file);
    const sourceStat = tryLstat(sourcePath);
    if (!sourceStat || sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
      issues.push({ path: file, message: "required source file must be a regular file and cannot be a symbolic link" });
      continue;
    }
    try {
      const content = readFileSync(sourcePath);
      if (containsCredentialLikeText(content.toString("utf8"))) {
        issues.push({ path: file, message: "credential-like value is forbidden in package input" });
        continue;
      }
      if (file.endsWith(".json")) {
        const parsed = JSON.parse(content.toString("utf8")) as unknown;
        if (containsCredentialLikeJsonField(parsed)) {
          issues.push({ path: file, message: "credential-like JSON field is forbidden in package input" });
          continue;
        }
      }
      sourceBuffers.set(file, content);
    } catch (error) {
      issues.push({ path: file, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (issues.length > 0) {
    return result(packagePath, [], issues);
  }

  let outputCreated = false;
  try {
    mkdirSync(dirname(packagePath), { recursive: true });
    mkdirSync(packagePath);
    outputCreated = true;
    for (const file of INPUT_FILES) {
      const content = sourceBuffers.get(file);
      if (!content) throw new Error(`prepared source content is missing: ${file}`);
      writeFileSync(join(packagePath, file), content, { flag: "wx" });
    }
    writeChecksums(packagePath, INPUT_FILES);
  } catch (error) {
    if (outputCreated) rmSync(packagePath, { recursive: true, force: true });
    issues.push({ path: packagePath, message: error instanceof Error ? error.message : String(error) });
    return result(packagePath, [], issues);
  }

  const verification = verifyShadowEvidencePackage(packagePath);
  if (!verification.ok) {
    rmSync(packagePath, { recursive: true, force: true });
    return result(packagePath, [], verification.issues);
  }
  return {
    ok: true,
    packagePath,
    copiedFiles: [...INPUT_FILES, "checksums.txt"],
    checksumFiles: verification.checksumFiles,
    issues: [],
  };
}

function writeChecksums(packagePath: string, files: readonly string[]): void {
  const lines = files.map((file) => {
    const hash = createHash("sha256")
      .update(readFileSync(join(packagePath, file)))
      .digest("hex");
    return `${hash}  ${file}`;
  });
  writeFileSync(join(packagePath, "checksums.txt"), `${lines.join("\n")}\n`, { flag: "wx" });
}

function result(
  packagePath: string,
  copiedFiles: string[],
  issues: ShadowEvidencePackageIssue[],
): ShadowEvidencePackageAssemblyResult {
  return {
    ok: false,
    packagePath,
    copiedFiles,
    checksumFiles: 0,
    issues,
  };
}

function pathExists(path: string): boolean {
  return tryLstat(path) !== null;
}

function isDirectory(path: string): boolean {
  const stat = tryLstat(path);
  if (!stat) return false;
  return stat.isDirectory() && !stat.isSymbolicLink();
}

function tryLstat(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}
