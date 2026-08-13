import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readDesktopVersion, resolveReleaseArtifacts } from "./verify-signatures.mjs";
import {
  createLegacyDatabaseFixture,
  readLegacySchemaEvidence,
  readUpgradeMarker,
} from "./package-upgrade-fixture.mjs";
import {
  remainingEntries,
  runProcess,
  runtimeArguments,
  UNINSTALL_TIMEOUT_MS,
  waitFor,
} from "./package-smoke-utils.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isRequired() {
  return String(process.env.REQUIRE_PACKAGE_INSTALL ?? "").trim().toLowerCase() === "true";
}

function readArgumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

async function runInstallSmoke({
  upgrade = false,
  previousInstallerPath,
  recovery = false,
} = {}) {
  const version = readDesktopVersion();
  const artifacts = resolveReleaseArtifacts(version);
  if (!existsSync(artifacts.installer)) {
    throw new Error(`NSIS installer was not found: ${artifacts.installer}`);
  }
  const initialInstaller = previousInstallerPath
    ? resolve(projectRoot, previousInstallerPath)
    : artifacts.installer;
  if (!existsSync(initialInstaller)) {
    throw new Error(`Previous NSIS installer was not found: ${initialInstaller}`);
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-package-install-"));
  const installDir = join(tempRoot, "installed");
  const installedExecutable = join(installDir, "Amazon Monitor.exe");
  const uninstaller = join(installDir, "Uninstall Amazon Monitor.exe");
  const runtimeScript = join(projectRoot, "scripts", "verify-package-runtime.mjs");
  const recoveryScripts = [
    join(projectRoot, "scripts", "verify-package-agent-runtime.mjs"),
    join(projectRoot, "scripts", "verify-package-api-recovery.mjs"),
    join(projectRoot, "scripts", "verify-package-agent-crawler-recovery.mjs"),
    join(projectRoot, "scripts", "verify-package-notification-runtime.mjs"),
  ];
  const userDataRoot = upgrade ? join(tempRoot, "user-data") : undefined;
  const databasePath = userDataRoot
    ? join(userDataRoot, "data", "amazon-monitor.sqlite")
    : undefined;

  try {
    const installerResult = await runProcess(
      initialInstaller,
      ["/S", `/D=${installDir}`],
      { cwd: projectRoot },
    );
    await waitFor("NSIS installed files", () => (
      existsSync(installedExecutable) && existsSync(uninstaller)
    ), 30_000);

    let runtimeResult;
    let upgradeEvidence;
    if (!upgrade) {
      runtimeResult = await runProcess(
        process.execPath,
        runtimeArguments(runtimeScript, installedExecutable, userDataRoot),
        { cwd: projectRoot },
      );
    } else {
      if (!databasePath) throw new Error("Upgrade smoke database path is missing");
      const upgradeMarker = `package-upgrade-${version}`;
      createLegacyDatabaseFixture(databasePath, upgradeMarker);

      let reinstallResult;
      let upgradedRuntimeResult;
      if (previousInstallerPath) {
        reinstallResult = await runProcess(
          artifacts.installer,
          ["/S", `/D=${installDir}`],
          { cwd: projectRoot },
        );
        await waitFor("NSIS overwritten files", () => (
          existsSync(installedExecutable) && existsSync(uninstaller)
        ), 30_000);
        runtimeResult = await runProcess(
          process.execPath,
          runtimeArguments(runtimeScript, installedExecutable, userDataRoot),
          { cwd: projectRoot },
        );
      } else {
        runtimeResult = await runProcess(
          process.execPath,
          runtimeArguments(runtimeScript, installedExecutable, userDataRoot),
          { cwd: projectRoot },
        );
        reinstallResult = await runProcess(
          artifacts.installer,
          ["/S", `/D=${installDir}`],
          { cwd: projectRoot },
        );
        await waitFor("NSIS overwritten files", () => (
          existsSync(installedExecutable) && existsSync(uninstaller)
        ), 30_000);
        upgradedRuntimeResult = await runProcess(
          process.execPath,
          runtimeArguments(runtimeScript, installedExecutable, userDataRoot),
          { cwd: projectRoot },
        );
      }

      const markerAfterReinstall = readUpgradeMarker(databasePath);
      if (markerAfterReinstall !== upgradeMarker) {
        throw new Error(
          `Upgrade removed the user data marker: expected ${upgradeMarker}, got ${markerAfterReinstall ?? "missing"}`,
        );
      }
      const markerAfterRuntime = readUpgradeMarker(databasePath);
      if (markerAfterRuntime !== upgradeMarker) {
        throw new Error(
          `Upgraded runtime changed the user data marker: expected ${upgradeMarker}, got ${markerAfterRuntime ?? "missing"}`,
        );
      }
      upgradeEvidence = {
        marker: upgradeMarker,
        markerAfterReinstall,
        markerAfterRuntime,
        reinstallOutputTail: reinstallResult.outputTail,
        upgradedRuntimeOutputTail: (upgradedRuntimeResult ?? runtimeResult).outputTail,
        legacySchemaEvidence: readLegacySchemaEvidence(databasePath),
      };
    }

    const recoveryEvidence = [];
    if (recovery) {
      for (const recoveryScript of recoveryScripts) {
        const result = await runProcess(
          process.execPath,
          [recoveryScript, installedExecutable],
          { cwd: projectRoot },
        );
        recoveryEvidence.push({
          script: basename(recoveryScript),
          outputTail: result.outputTail,
        });
      }
    }

    const uninstallResult = await runProcess(
      uninstaller,
      ["/S"],
      { cwd: installDir, timeoutMilliseconds: UNINSTALL_TIMEOUT_MS },
    );
    const remaining = await waitFor(
      "NSIS uninstall cleanup",
      () => {
        const entries = remainingEntries(installDir);
        return !existsSync(installDir) || entries.length === 0 ? entries : undefined;
      },
      UNINSTALL_TIMEOUT_MS,
    );
    const markerAfterUninstall = upgrade && databasePath
      ? readUpgradeMarker(databasePath)
      : undefined;
    if (upgrade && markerAfterUninstall !== upgradeEvidence?.marker) {
      throw new Error(
        `Uninstall removed the user data marker: expected ${upgradeEvidence?.marker}, got ${markerAfterUninstall ?? "missing"}`,
      );
    }

    return {
      ok: true,
      version,
      installer: artifacts.installer,
      initialInstaller,
      installDir,
      installerOutputTail: installerResult.outputTail,
      installedExecutable,
      runtimeOutputTail: runtimeResult?.outputTail ?? [],
      initialRuntimeSkipped: Boolean(upgrade && previousInstallerPath),
      uninstaller,
      uninstallOutputTail: uninstallResult.outputTail,
      remainingInstallEntries: remaining,
      ...(upgradeEvidence
        ? {
            upgrade: {
              ...upgradeEvidence,
              markerAfterUninstall,
              userDataRoot,
            },
          }
        : {}),
      ...(recovery
        ? { recovery: recoveryEvidence }
        : {}),
      uninstalled: true,
    };
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

async function main() {
  const upgrade = process.argv.includes("--upgrade");
  const recovery = process.argv.includes("--recovery");
  const previousInstallerPath = readArgumentValue("--previous-installer");
  if (process.platform !== "win32") {
    const result = {
      ok: !isRequired(),
      skipped: true,
      reason: `${recovery ? "NSIS install/recovery/uninstall" : upgrade ? "NSIS install/upgrade/uninstall" : "NSIS install/uninstall"} smoke is only supported on Windows.`,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(
    await runInstallSmoke({ upgrade, previousInstallerPath, recovery }),
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
