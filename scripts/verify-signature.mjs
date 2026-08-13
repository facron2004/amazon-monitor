import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_EXECUTABLE = "release/electron/win-unpacked/Amazon Monitor.exe";

function isMainModule() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

export function isSignatureRequired(value = process.env.REQUIRE_CODE_SIGNATURE) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function normalizeSignatureStatus(output) {
  const lines = String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "Unavailable";
}

function encodePowerShellCommand(command) {
  return Buffer.from(command, "utf16le").toString("base64");
}

function runPowerShell(command, run) {
  const encodedCommand = encodePowerShellCommand(command);
  const candidates = process.env.POWERSHELL_EXE
    ? [process.env.POWERSHELL_EXE]
    : ["pwsh.exe", "powershell.exe"];
  let lastResult;
  for (const executable of candidates) {
    const result = run(
      executable,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedCommand,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    lastResult = result;
    if (!result.error && result.status === 0 && normalizeSignatureStatus(result.stdout) !== "Unavailable") {
      return result;
    }
  }
  return lastResult;
}

export function readAuthenticodeStatus(
  executablePath,
  { platformName = process.platform, run = spawnSync } = {},
) {
  if (platformName !== "win32") {
    return {
      status: "UnsupportedPlatform",
      detail: "Authenticode verification is only available on Windows.",
    };
  }

  const command = [
    "$ErrorActionPreference = 'Stop'",
    `(Get-AuthenticodeSignature -LiteralPath '${executablePath.replaceAll("'", "''")}').Status`,
  ].join("; ");
  const result = runPowerShell(command, run);

  if (!result || result.error) {
    return { status: "Unavailable", detail: result?.error?.message ?? "PowerShell could not be started." };
  }

  const status = normalizeSignatureStatus(result.stdout);
  if (result.status !== 0 || status === "Unavailable") {
    const detail = String(result.stderr ?? "").trim() || `PowerShell exited with code ${String(result.status)}`;
    return { status: "Unavailable", detail };
  }
  return { status, detail: String(result.stderr ?? "").trim() || undefined };
}

export function verifySignature(
  executablePath = DEFAULT_EXECUTABLE,
  {
    required = isSignatureRequired(),
    platformName = process.platform,
    fileExists = existsSync,
    readStatus = readAuthenticodeStatus,
  } = {},
) {
  const absolutePath = resolve(executablePath);
  if (!fileExists(absolutePath)) {
    return {
      ok: false,
      required,
      platform: platformName,
      executable: absolutePath,
      status: "Missing",
      message: `Packaged executable was not found: ${absolutePath}`,
    };
  }

  const signature = readStatus(absolutePath, { platformName });
  const valid = signature.status === "Valid";
  const ok = valid || (!required && signature.status !== "Unavailable");
  let message;
  if (valid) {
    message = "Authenticode signature is valid.";
  } else if (required && platformName !== "win32") {
    message = "REQUIRE_CODE_SIGNATURE=true requires Windows Authenticode verification.";
  } else if (required) {
    message = `Code signature status must be Valid; received ${signature.status}. Configure electron-builder signing through CSC_LINK and CSC_KEY_PASSWORD in the release environment.`;
  } else if (signature.status === "UnsupportedPlatform") {
    message = "Signature check was not run because the current platform is not Windows; the gate is optional.";
  } else if (signature.status === "Unavailable") {
    message = `Signature check could not be completed: ${signature.detail ?? "unknown error"}`;
  } else {
    message = `Unsigned or untrusted package accepted for local verification because REQUIRE_CODE_SIGNATURE is not true (status: ${signature.status}).`;
  }

  return {
    ok,
    required,
    platform: platformName,
    executable: absolutePath,
    status: signature.status,
    ...(signature.detail ? { detail: signature.detail } : {}),
    message,
  };
}

if (isMainModule()) {
  const result = verifySignature(process.argv[2] ?? DEFAULT_EXECUTABLE);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
