import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
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
const SMTP_USER = "package-smoke-user";
const SMTP_PASS = "package-smoke-secret";
const SMTP_FROM = "package-smoke@example.test";
const SMTP_TARGET = "ops@example.test";

function isRequired() {
  return String(process.env.REQUIRE_PACKAGE_NOTIFICATION_RUNTIME ?? "").trim().toLowerCase() === "true";
}

async function startSmtpStub() {
  const deliveries = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    const state = {
      authPending: undefined,
      authUser: undefined,
      authPassed: false,
      dataMode: false,
      message: "",
      mailFrom: undefined,
      recipients: [],
    };
    let buffer = "";
    const write = (line) => {
      if (!socket.destroyed) socket.write(`${line}\r\n`);
    };
    const completeAuth = (user, pass) => {
      state.authUser = user;
      state.authPending = undefined;
      state.authPassed = user === SMTP_USER && pass === SMTP_PASS;
      write(state.authPassed ? "235 2.7.0 Authentication successful" : "535 5.7.8 Authentication failed");
    };
    const decodeAuth = (value) => {
      try {
        return Buffer.from(value, "base64").toString("utf8");
      } catch {
        return "";
      }
    };
    const handleLine = (line) => {
      if (state.dataMode) {
        if (line === ".") {
          state.dataMode = false;
          deliveries.push({
            authUser: state.authUser,
            authPassed: state.authPassed,
            mailFrom: state.mailFrom,
            recipients: [...state.recipients],
            dataBytes: Buffer.byteLength(state.message, "utf8"),
            containsSecret: state.message.includes(SMTP_PASS),
          });
          write("250 2.0.0 Message accepted");
        } else {
          state.message += `${line}\n`;
        }
        return;
      }

      if (state.authPending === "plain") {
        const fields = decodeAuth(line).split("\u0000");
        completeAuth(fields.at(-2) ?? "", fields.at(-1) ?? "");
        return;
      }
      if (state.authPending === "login-user") {
        state.authUser = decodeAuth(line);
        state.authPending = "login-pass";
        write("334 UGFzc3dvcmQ6");
        return;
      }
      if (state.authPending === "login-pass") {
        completeAuth(state.authUser ?? "", decodeAuth(line));
        return;
      }

      const [command, ...argumentsList] = line.trim().split(/\s+/);
      const upperCommand = command?.toUpperCase() ?? "";
      const argument = argumentsList.join(" ");
      if (upperCommand === "EHLO" || upperCommand === "HELO") {
        write("250-localhost");
        write("250-AUTH PLAIN LOGIN");
        write("250 SIZE 52428800");
        return;
      }
      if (upperCommand === "AUTH") {
        const [mechanism, initial] = argumentsList;
        if (mechanism?.toUpperCase() === "PLAIN") {
          if (initial) {
            const fields = decodeAuth(initial).split("\u0000");
            completeAuth(fields.at(-2) ?? "", fields.at(-1) ?? "");
          } else {
            state.authPending = "plain";
            write("334 ");
          }
          return;
        }
        if (mechanism?.toUpperCase() === "LOGIN") {
          state.authPending = "login-user";
          write("334 VXNlcm5hbWU6");
          return;
        }
        write("504 5.5.4 Unsupported authentication mechanism");
        return;
      }
      if (upperCommand === "MAIL") {
        state.mailFrom = argument.match(/<([^>]+)>/)?.[1] ?? argument;
        write(state.authPassed ? "250 2.1.0 OK" : "530 5.7.0 Authentication required");
        return;
      }
      if (upperCommand === "RCPT") {
        const recipient = argument.match(/<([^>]+)>/)?.[1] ?? argument;
        state.recipients.push(recipient);
        write(state.authPassed ? "250 2.1.5 OK" : "530 5.7.0 Authentication required");
        return;
      }
      if (upperCommand === "DATA") {
        if (!state.authPassed) {
          write("530 5.7.0 Authentication required");
          return;
        }
        state.dataMode = true;
        state.message = "";
        write("354 End data with <CR><LF>.<CR><LF>");
        return;
      }
      if (upperCommand === "RSET" || upperCommand === "NOOP") {
        write("250 2.0.0 OK");
        return;
      }
      if (upperCommand === "QUIT") {
        write("221 2.0.0 Bye");
        socket.end();
        return;
      }
      write("250 2.0.0 OK");
    };

    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    write("220 localhost Amazon Monitor package smoke SMTP");
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address !== "object" || !address.port) {
    server.close();
    throw new Error("Package notification SMTP stub did not expose a port");
  }

  return {
    port: address.port,
    deliveries,
    close: () => new Promise((resolvePromise) => {
      sockets.forEach((socket) => socket.destroy());
      server.close(() => resolvePromise());
    }),
  };
}

async function rendererPage(debugPort) {
  const target = await waitFor("packaged notification renderer", () => rendererTarget(debugPort));
  const { chromium } = desktopRequire("playwright");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url() === target.url) ?? pages[0];
  if (!page) {
    await browser.close();
    throw new Error("Packaged Electron did not expose a notification smoke renderer page");
  }
  await page.waitForSelector("#app", { state: "attached", timeout: 15_000 });
  return { browser, origin: new URL(target.url).origin, page };
}

async function pageApi(page, path, init = {}) {
  return page.evaluate(async ({ path: requestPath, init: requestInit }) => {
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
  }, { path, init });
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

async function runSmoke(executablePath) {
  const executable = resolve(executablePath);
  if (!existsSync(executable)) throw new Error(`Packaged executable was not found: ${executable}`);
  const userDataRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-package-notification-runtime-"));
  mkdirSync(userDataRoot, { recursive: true });
  const envFile = join(userDataRoot, ".env");
  const smtpStub = await startSmtpStub();
  writeFileSync(envFile, [
    `SMTP_HOST=127.0.0.1`,
    `SMTP_PORT=${smtpStub.port}`,
    "SMTP_SECURE=false",
    `SMTP_USER=${SMTP_USER}`,
    `SMTP_PASS=${SMTP_PASS}`,
    `SMTP_FROM=${SMTP_FROM}`,
    "SMTP_REQUIRE_TLS=false",
    "SMTP_TIMEOUT_MS=5000",
    "UNSAFE_NOT_ALLOWED=must-not-load",
  ].join("\n"));
  const debugPort = await findFreePort();
  const output = [];
  const childEnvironment = {
    ...process.env,
    DB_PATH: join(userDataRoot, "isolated.sqlite"),
    NODE_ENV: "production",
    ENABLE_CRON: "false",
    RUN_WORKER: "false",
  };
  for (const key of [
    "AMAZON_MONITOR_ENV_FILE",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_REQUIRE_TLS",
    "SMTP_TIMEOUT_MS",
    "SMTP_PROXY",
  ]) {
    delete childEnvironment[key];
  }
  const child = spawn(executable, [
    `--user-data-dir=${userDataRoot}`,
    `--remote-debugging-port=${debugPort}`,
    "--disable-gpu",
  ], {
    cwd: dirname(executable),
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  let browser;
  try {
    const renderer = await rendererPage(debugPort);
    browser = renderer.browser;
    const { page, origin } = renderer;
    const readiness = await waitFor("packaged notification API readiness", async () => {
      const response = await fetchJson(`${origin}/api/ready`);
      return response.status === 200 && response.body?.ok ? response.body : undefined;
    });
    const registration = await pageApi(page, "/api/auth/register-first-user", {
      method: "POST",
      body: JSON.stringify({
        username: "notification-smoke-admin",
        password: "NotificationSmokePassword!2026",
        displayName: "Notification Runtime Smoke",
      }),
    });
    if (registration.status !== 201) {
      throw new Error(`Notification smoke bootstrap failed: ${registration.status} ${registration.text}`);
    }
    const created = await pageApi(page, "/api/notifications/schedules", {
      method: "POST",
      body: JSON.stringify({
        name: "Package SMTP runtime smoke",
        channel: "email",
        target: SMTP_TARGET,
        sendTime: "09:30",
        timezone: "Asia/Shanghai",
        status: "enabled",
      }),
    });
    if (created.status !== 201) {
      throw new Error(`Notification schedule creation failed: ${created.status} ${created.text}`);
    }
    const scheduleId = created.body?.id;
    if (!Number.isInteger(scheduleId)) throw new Error("Notification smoke schedule id is missing");
    const sent = await pageApi(page, `/api/notifications/schedules/${scheduleId}/send`, {
      method: "POST",
      body: JSON.stringify({ date: "2026-08-09" }),
    });
    if (sent.status !== 200 || sent.body?.status !== "success") {
      throw new Error(`Notification send failed: ${sent.status} ${sent.text}`);
    }
    const delivery = await waitFor("package notification SMTP delivery", () => (
      smtpStub.deliveries.find((item) => item.mailFrom === SMTP_FROM && item.recipients.includes(SMTP_TARGET))
    ));
    if (!delivery.authPassed || delivery.authUser !== SMTP_USER || delivery.dataBytes <= 0 || delivery.containsSecret) {
      throw new Error(`Unexpected package notification SMTP evidence: ${JSON.stringify({
        authUser: delivery.authUser,
        authPassed: delivery.authPassed,
        mailFrom: delivery.mailFrom,
        recipients: delivery.recipients,
        dataBytes: delivery.dataBytes,
        containsSecret: delivery.containsSecret,
      })}`);
    }
    const logs = await pageApi(page, "/api/notifications/logs");
    if (logs.status !== 200 || logs.body?.[0]?.status !== "success") {
      throw new Error(`Notification send log was not successful: ${logs.status} ${logs.text}`);
    }
    const outputText = output.join("");
    if (outputText.includes(SMTP_PASS)) {
      throw new Error("SMTP password appeared in packaged process output");
    }
    return {
      ok: true,
      executable,
      debugPort,
      rendererOrigin: origin,
      envFile,
      readiness,
      schedule: {
        id: scheduleId,
        target: SMTP_TARGET,
        logStatus: logs.body[0].status,
      },
      smtp: {
        host: "127.0.0.1",
        port: smtpStub.port,
        authUser: delivery.authUser,
        authPassed: delivery.authPassed,
        mailFrom: delivery.mailFrom,
        recipients: delivery.recipients,
        dataBytes: delivery.dataBytes,
        secretObserved: false,
      },
      outputLines: outputText.trim().split(/\r?\n/).filter(Boolean).slice(-10),
    };
  } finally {
    await browser?.close();
    await smtpStub.close();
    const terminated = terminateProcessTree(child.pid);
    await waitForExit(child);
    rmSync(userDataRoot, { force: true, recursive: true });
    if (child.exitCode === null) {
      throw new Error(
        `Could not terminate packaged notification smoke process tree rooted at PID ${child.pid}`
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
      reason: "Packaged notification runtime smoke is only supported on Windows.",
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const result = await runSmoke(process.argv[2] ?? DEFAULT_EXECUTABLE);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
