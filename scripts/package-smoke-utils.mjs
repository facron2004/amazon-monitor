import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";

export const DEFAULT_PROCESS_TIMEOUT_MS = 180_000;
export const UNINSTALL_TIMEOUT_MS = 90_000;

export function terminateProcessTree(pid) {
  if (!pid || process.platform !== "win32") return true;
  const result = spawnSync(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    { encoding: "utf8", windowsHide: true },
  );
  return result.status === 0;
}

export function outputTail(output) {
  return output.join("").trim().split(/\r?\n/).filter(Boolean).slice(-20);
}

export function runProcess(
  executable,
  args,
  { cwd, timeoutMilliseconds = DEFAULT_PROCESS_TIMEOUT_MS } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const output = [];
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let timedOut = false;
    let killTimeout;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      callback(value);
    };
    timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
      try {
        child.kill();
      } catch {
        // The process may already have exited while taskkill was running.
      }
      killTimeout = setTimeout(() => {
        terminateProcessTree(child.pid);
        finish(rejectPromise, new Error(
          `${executable} timed out after ${timeoutMilliseconds}ms; output: ${outputTail(output).join(" | ")}`,
        ));
      }, 5_000);
    }, timeoutMilliseconds);
    child.stdout?.on("data", (chunk) => output.push(String(chunk)));
    child.stderr?.on("data", (chunk) => output.push(String(chunk)));
    child.once("error", (error) => finish(rejectPromise, error));
    child.once("close", (code, signal) => {
      const tail = outputTail(output);
      if (timedOut) {
        finish(rejectPromise, new Error(
          `${executable} timed out after ${timeoutMilliseconds}ms; output: ${tail.join(" | ")}`,
        ));
        return;
      }
      if (code !== 0) {
        finish(rejectPromise, new Error(
          `${executable} exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}; output: ${tail.join(" | ")}`,
        ));
        return;
      }
      finish(resolvePromise, { code, signal, outputTail: tail });
    });
  });
}

export function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function findFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  if (!port) throw new Error("Could not allocate a local debugging port");
  return port;
}

export async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { body, status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function rendererTarget(debugPort) {
  const response = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
  if (response.status !== 200 || !Array.isArray(response.body)) return undefined;
  return response.body.find((target) => (
    target
    && target.type === "page"
    && typeof target.url === "string"
    && target.url.startsWith("http://127.0.0.1:")
  ));
}

export async function waitFor(description, operation, timeoutMilliseconds = UNINSTALL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`${description} did not complete within ${timeoutMilliseconds}ms${suffix}`);
}

export function remainingEntries(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory);
}

export function runtimeArguments(runtimeScript, executable, userDataRoot) {
  return [
    runtimeScript,
    executable,
    ...(userDataRoot ? [`--user-data-dir=${userDataRoot}`] : []),
  ];
}
