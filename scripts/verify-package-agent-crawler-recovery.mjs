import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  delay,
  fetchJson,
  findFreePort,
  rendererTarget,
  terminateProcessTree,
  waitFor,
} from "./package-smoke-utils.mjs";

const DEFAULT_EXECUTABLE = "release/electron/win-unpacked/Amazon Monitor.exe";
const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));

function isRequired() {
  return String(process.env.REQUIRE_PACKAGE_AGENT_CRAWLER_RECOVERY ?? "")
    .trim()
    .toLowerCase() === "true";
}

async function inspectRenderer(debugPort, origin) {
  const { chromium } = desktopRequire("playwright");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url().startsWith(origin)) ?? pages[0];
    if (!page) throw new Error("Packaged Electron did not expose a renderer page");
    return await page.evaluate(async () => ({
      origin: window.location.origin,
      appChildren: document.querySelector("#app")?.children.length ?? 0,
      processStatus: await window.amazonMonitorDesktop?.processStatus() ?? null,
    }));
  } finally {
    await browser.close();
  }
}

function findNodeServiceUtilities(rootPid) {
  const command = [
    "$root = [int]$env:AMAZON_MONITOR_ROOT_PID;",
    "$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine);",
    "$ids = [System.Collections.Generic.HashSet[int]]::new();",
    "$ids.Add($root) | Out-Null;",
    "$changed = $true;",
    "while ($changed) { $changed = $false; foreach ($item in $all) { if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true } } }",
    "$targets = $all | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.CommandLine -match '--utility-sub-type=node.mojom.NodeService' };",
    "$targets | ForEach-Object { $listening = @(Get-NetTCPConnection -State Listen -OwningProcess ([int]$_.ProcessId) -ErrorAction SilentlyContinue).Count -gt 0; \"{0}|{1}\" -f $_.ProcessId, [int]$listening }",
  ].join(" ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      encoding: "utf8",
      env: { ...process.env, AMAZON_MONITOR_ROOT_PID: String(rootPid) },
      windowsHide: true,
    },
  );
  return String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().split("|"))
    .filter(([pid, listening]) => pid && (listening === "0" || listening === "1"))
    .map(([pid, listening]) => ({
      pid: Number.parseInt(pid, 10),
      listening: listening === "1",
    }))
    .filter(({ pid }) => Number.isInteger(pid) && pid > 0);
}

function allProcessesRunning(state) {
  return state?.processStatus?.api === "running"
    && state?.processStatus?.agent === "running"
    && state?.processStatus?.crawler === "running";
}

async function waitForHealthyRenderer(debugPort, origin, expectedBootId) {
  return waitFor("Agent/Crawler utility recovery", async () => {
    const state = await inspectRenderer(debugPort, origin);
    if (state.origin !== origin || state.appChildren < 1 || !allProcessesRunning(state)) {
      return undefined;
    }
    const readiness = await fetchJson(`${origin}/api/ready`);
    if (readiness.status !== 200 || !readiness.body?.ok) return undefined;
    if (expectedBootId && readiness.body.bootId !== expectedBootId) return undefined;
    return { state, readiness: readiness.body };
  }, 60_000);
}

async function runSmoke(executablePath) {
  const executable = resolve(executablePath);
  if (!existsSync(executable)) throw new Error(`Packaged executable was not found: ${executable}`);
  const userDataRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-package-agent-crawler-recovery-"));
  const debugPort = await findFreePort();
  const databasePath = join(userDataRoot, "isolated.sqlite");
  const output = [];
  const child = spawn(
    executable,
    [
      `--user-data-dir=${userDataRoot}`,
      `--remote-debugging-port=${debugPort}`,
      "--disable-gpu",
    ],
    {
      cwd: dirname(executable),
      env: {
        ...process.env,
        DB_PATH: databasePath,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  const childError = new Promise((_, rejectPromise) => child.once("error", rejectPromise));

  try {
    const target = await Promise.race([
      waitFor("packaged renderer", () => rendererTarget(debugPort)),
      childError,
    ]);
    const origin = new URL(target.url).origin;
    const before = await waitFor("packaged API readiness", async () => {
      const response = await fetchJson(`${origin}/api/ready`);
      return response.status === 200 && response.body?.ok ? response.body : undefined;
    });
    const initialUtilities = await waitFor(
      "packaged Agent/Crawler utility processes",
      () => {
        const utilities = findNodeServiceUtilities(child.pid);
        return utilities.length >= 3 && utilities.some((utility) => utility.listening)
          ? utilities
          : undefined;
      },
      30_000,
    );
    const apiUtility = initialUtilities.find((utility) => utility.listening);
    if (!apiUtility) throw new Error("Could not identify the packaged API utility process");
    const recoveries = [];
    const killedPids = new Set();

    for (let index = 0; index < 2; index += 1) {
      const targetUtility = await waitFor(
        `packaged utility ${index + 1}`,
        () => findNodeServiceUtilities(child.pid)
          .find((utility) => !utility.listening && !killedPids.has(utility.pid)),
        30_000,
      );
      killedPids.add(targetUtility.pid);
      const beforeKill = await inspectRenderer(debugPort, origin);
      if (!allProcessesRunning(beforeKill)) {
        throw new Error(`Utility was not healthy before termination: ${JSON.stringify(beforeKill.processStatus)}`);
      }
      if (!terminateProcessTree(targetUtility.pid)) {
        throw new Error(`Could not terminate packaged utility process ${targetUtility.pid}`);
      }
      await waitFor(`utility ${targetUtility.pid} exit`, () => {
        if (child.exitCode !== null) throw new Error("Electron exited during utility recovery");
        return findNodeServiceUtilities(child.pid).every((utility) => utility.pid !== targetUtility.pid);
      }, 30_000);
      const recovered = await waitForHealthyRenderer(debugPort, origin, before.bootId);
      const afterUtilities = await waitFor(
        "utility process table after recovery",
        () => {
          const utilities = findNodeServiceUtilities(child.pid);
          return utilities.filter((utility) => !utility.listening).length >= 2
            && utilities.find((utility) => utility.listening)?.pid === apiUtility.pid
            ? utilities
            : undefined;
        },
        30_000,
      );
      const replacement = afterUtilities.find((utility) => (
        !utility.listening
        && utility.pid !== targetUtility.pid
        && !killedPids.has(utility.pid)
      ));
      recoveries.push({
        ordinal: index + 1,
        terminatedPid: targetUtility.pid,
        replacementPid: replacement?.pid,
        beforeStatus: beforeKill.processStatus,
        afterStatus: recovered.state.processStatus,
      });
    }

    const finalUtilities = findNodeServiceUtilities(child.pid);
    if (finalUtilities.filter((utility) => !utility.listening).length < 2) {
      throw new Error(`Expected Agent and Crawler utilities after recovery: ${JSON.stringify(finalUtilities)}`);
    }
    return {
      executable,
      debugPort,
      processId: child.pid,
      rendererOrigin: origin,
      bootId: before.bootId,
      apiUtilityPid: apiUtility.pid,
      recoveries,
      finalUtilities,
      outputLines: output.join("").trim().split(/\r?\n/).filter(Boolean).slice(-10),
    };
  } finally {
    const terminated = terminateProcessTree(child.pid);
    await delay(500);
    rmSync(userDataRoot, { force: true, recursive: true });
    if (child.exitCode === null && !terminated) {
      throw new Error(`Could not terminate packaged process tree rooted at PID ${child.pid}`);
    }
  }
}

async function main() {
  if (process.platform !== "win32") {
    const result = {
      ok: !isRequired(),
      skipped: true,
      reason: "Packaged Electron process recovery is only supported on Windows.",
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const result = await runSmoke(process.argv[2] ?? DEFAULT_EXECUTABLE);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
