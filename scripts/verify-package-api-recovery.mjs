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
  return String(process.env.REQUIRE_PACKAGE_API_RECOVERY ?? "").trim().toLowerCase() === "true";
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

function findApiUtilityPid(rootPid) {
  const command = [
    "$root = [int]$env:AMAZON_MONITOR_ROOT_PID;",
    "$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine);",
    "$ids = [System.Collections.Generic.HashSet[int]]::new();",
    "$ids.Add($root) | Out-Null;",
    "$changed = $true;",
    "while ($changed) { $changed = $false; foreach ($item in $all) { if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true } } }",
    "$target = $all | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.CommandLine -match '--utility-sub-type=node.mojom.NodeService' } | Where-Object { Get-NetTCPConnection -State Listen -OwningProcess ([int]$_.ProcessId) -ErrorAction SilentlyContinue } | Select-Object -First 1;",
    "if ($null -ne $target) { $target.ProcessId }",
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
  const pid = Number.parseInt(String(result.stdout ?? "").trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

async function runSmoke(executablePath) {
  const executable = resolve(executablePath);
  if (!existsSync(executable)) throw new Error(`Packaged executable was not found: ${executable}`);
  const userDataRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-package-api-recovery-"));
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
    const apiPid = await waitFor(
      "packaged API utility process",
      () => findApiUtilityPid(child.pid),
      30_000,
    );
    const terminated = terminateProcessTree(apiPid);
    if (!terminated) throw new Error(`Could not terminate API utility process ${apiPid}`);
    const after = await waitFor("API utility recovery on the same origin", async () => {
      if (child.exitCode !== null) throw new Error("Electron exited while API utility was restarting");
      const response = await fetchJson(`${origin}/api/ready`);
      if (response.status !== 200 || !response.body?.ok) return undefined;
      if (response.body.bootId === before.bootId) return undefined;
      return response.body;
    }, 60_000);
    const renderer = await waitFor("renderer recovery", async () => {
      const state = await inspectRenderer(debugPort, origin);
      return state.origin === origin && state.appChildren > 0 ? state : undefined;
    }, 30_000);
    if (
      renderer.processStatus?.api !== "running"
      || renderer.processStatus?.agent !== "running"
      || renderer.processStatus?.crawler !== "running"
    ) {
      throw new Error(`Unexpected process status after API recovery: ${JSON.stringify(renderer.processStatus)}`);
    }
    return {
      executable,
      debugPort,
      processId: child.pid,
      rendererOrigin: origin,
      beforeBootId: before.bootId,
      afterBootId: after.bootId,
      apiUtilityPid: apiPid,
      renderer,
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
