import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  fetchJson,
  findFreePort,
  rendererTarget,
  terminateProcessTree,
  waitFor,
} from "./package-smoke-utils.mjs";

const DEFAULT_EXECUTABLE = "release/electron/win-unpacked/Amazon Monitor.exe";
const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));

function isRequired() {
  return String(process.env.REQUIRE_PACKAGE_RUNTIME ?? "").trim().toLowerCase() === "true";
}

async function inspectRendererPage(debugPort, origin) {
  const { chromium } = desktopRequire("playwright");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url().startsWith(origin)) ?? pages[0];
    if (!page) throw new Error("Packaged Electron did not expose a renderer page");
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForSelector("#app", { state: "attached", timeout: 15_000 });
    const snapshot = await page.evaluate(() => {
      const app = document.querySelector("#app");
      const authScreen = document.querySelector(".auth-screen");
      const authStyle = authScreen ? getComputedStyle(authScreen) : undefined;
      return {
        readyState: document.readyState,
        appChildren: app?.children.length ?? 0,
        authScreenVisible: Boolean(
          authScreen
          && authStyle?.display !== "none"
          && authStyle?.visibility !== "hidden",
        ),
        passwordFieldCount: document.querySelectorAll("input[type='password']").length,
        stylesheetCount: document.styleSheets.length,
        bodyTextLength: document.body?.innerText.trim().length ?? 0,
      };
    });
    if (
      snapshot.appChildren < 1
      || !snapshot.authScreenVisible
      || snapshot.passwordFieldCount < 1
      || snapshot.stylesheetCount < 1
      || snapshot.bodyTextLength < 1
    ) {
      throw new Error(`Unexpected packaged renderer snapshot: ${JSON.stringify(snapshot)}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Packaged renderer page error: ${pageErrors.join("; ")}`);
    }
    return snapshot;
  } finally {
    await browser.close();
  }
}

async function inspectAuthenticatedBusinessApi(debugPort, origin) {
  const { chromium } = desktopRequire("playwright");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url().startsWith(origin)) ?? pages[0];
    if (!page) throw new Error("Packaged Electron did not expose a renderer page for API smoke");

    const requestJson = (path, init = {}) => page.evaluate(async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, {
        credentials: "include",
        ...requestInit,
        headers: {
          "content-type": "application/json",
          ...(requestInit.headers ?? {}),
        },
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      return { body, status: response.status, text };
    }, { requestPath: path, requestInit: init });

    const date = new Date().toISOString().slice(0, 10);
    const anonymous = await requestJson(`/api/dashboard/summary?date=${date}`);
    if (anonymous.status !== 401) {
      throw new Error(`Packaged business API accepted an anonymous request: ${anonymous.status}`);
    }

    const credentials = {
      username: "package-runtime-admin",
      password: "PackageRuntimePassword!2026",
      displayName: "Package Runtime Smoke",
    };
    const registration = await requestJson("/api/auth/register-first-user", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (registration.status !== 201) {
      throw new Error(`Packaged auth bootstrap failed: ${registration.status} ${registration.text}`);
    }

    const me = await requestJson("/api/auth/me");
    if (me.status !== 200 || me.body?.user?.username !== credentials.username) {
      throw new Error(`Packaged session restoration failed: ${me.status} ${me.text}`);
    }

    const dashboardAfterBootstrap = await requestJson(`/api/dashboard/summary?date=${date}`);
    if (
      dashboardAfterBootstrap.status !== 200
      || !dashboardAfterBootstrap.body
      || typeof dashboardAfterBootstrap.body !== "object"
    ) {
      throw new Error(
        `Packaged authenticated business API failed after bootstrap: ${dashboardAfterBootstrap.status} ${dashboardAfterBootstrap.text}`,
      );
    }

    const login = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    });
    if (login.status !== 200) {
      throw new Error(`Packaged login failed: ${login.status} ${login.text}`);
    }

    const dashboardAfterLogin = await requestJson(`/api/dashboard/summary?date=${date}`);
    if (dashboardAfterLogin.status !== 200) {
      throw new Error(
        `Packaged authenticated business API failed after login: ${dashboardAfterLogin.status} ${dashboardAfterLogin.text}`,
      );
    }

    return {
      anonymousStatus: anonymous.status,
      bootstrapStatus: registration.status,
      meStatus: me.status,
      loginStatus: login.status,
      dashboardStatus: dashboardAfterLogin.status,
      organizationId: me.body.context?.organization?.id ?? null,
    };
  } finally {
    await browser.close();
  }
}

function waitForExit(child, timeoutMilliseconds = 15_000) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, timeoutMilliseconds);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

async function runSmoke(executablePath, requestedUserDataRoot) {
  const executable = resolve(executablePath);
  if (!existsSync(executable)) {
    throw new Error(`Packaged executable was not found: ${executable}`);
  }
  const ownsUserDataRoot = !requestedUserDataRoot;
  const userDataRoot = requestedUserDataRoot
    ? resolve(requestedUserDataRoot)
    : mkdtempSync(join(tmpdir(), "amazon-monitor-package-runtime-"));
  mkdirSync(userDataRoot, { recursive: true });
  const databasePath = join(userDataRoot, "data", "amazon-monitor.sqlite");
  const debugPort = await findFreePort();
  const output = [];
  const child = spawn(
    executable,
    [
      `--user-data-dir=${userDataRoot}`,
      `--remote-debugging-port=${debugPort}`,
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--in-process-gpu",
    ],
    {
      cwd: dirname(executable),
      // Keep the smoke hermetic. An explicit DB_PATH prevents the packaged
      // Main process from discovering and copying a developer's live
      // workspace database before the API utility can become ready.
      env: { ...process.env, NODE_ENV: "production", DB_PATH: databasePath },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  const childError = new Promise((_, reject) => {
    child.once("error", reject);
  });

  try {
    let target;
    try {
      target = await Promise.race([
        waitFor("packaged renderer", () => rendererTarget(debugPort)),
        childError,
      ]);
    } catch (error) {
      const outputTail = output.join("").trim().split(/\r?\n/).filter(Boolean).slice(-10).join(" | ");
      throw new Error(`${error instanceof Error ? error.message : String(error)}${outputTail ? `; child output: ${outputTail}` : ""}`);
    }
    const origin = new URL(target.url).origin;
    const readiness = await waitFor("packaged API readiness", async () => {
      const response = await fetchJson(`${origin}/api/ready`);
      if (response.status !== 200 || !response.body?.ok) return undefined;
      if (response.body.webAssets !== true || response.body.database !== "ready") {
        throw new Error(`Unexpected readiness payload: ${JSON.stringify(response.body)}`);
      }
      return response.body;
    });
    const pageCheck = await inspectRendererPage(debugPort, origin);
    const businessApiCheck = await inspectAuthenticatedBusinessApi(debugPort, origin);
    return {
      executable,
      debugPort,
      rendererOrigin: origin,
      readiness,
      pageCheck,
      businessApiCheck,
      processId: child.pid,
      outputLines: output.join("").trim().split(/\r?\n/).filter(Boolean).slice(-10),
    };
  } finally {
    const terminated = terminateProcessTree(child.pid);
    await waitForExit(child);
    if (ownsUserDataRoot) rmSync(userDataRoot, { force: true, recursive: true });
    if (child.exitCode === null) {
      throw new Error(
        `Could not terminate packaged process tree rooted at PID ${child.pid}`
        + (terminated ? " after taskkill returned success" : " after taskkill failed"),
      );
    }
  }
}

async function main() {
  if (process.platform !== "win32") {
    const result = {
      ok: !isRequired(),
      skipped: true,
      reason: "Packaged Electron runtime smoke is only supported on Windows.",
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const requestedUserDataRoot = process.argv.slice(3)
    .find((argument) => argument.startsWith("--user-data-dir="))
    ?.slice("--user-data-dir=".length);
  const result = await runSmoke(process.argv[2] ?? DEFAULT_EXECUTABLE, requestedUserDataRoot);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
