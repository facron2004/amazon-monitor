import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
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
  return String(process.env.REQUIRE_PACKAGE_AGENT_RUNTIME ?? "").trim().toLowerCase() === "true";
}

function outputForSmoke() {
  return {
    summary: "Local Agent ASIN boundary and approval smoke completed",
    conclusions: [{
      text: "The isolated smoke verifies ASIN tool planning and approval transport but contains no business evidence.",
      scope: {
        marketplace: "ATVPDKIKX0DER",
        asin: "B000TEST01",
        categoryId: 1,
        categoryName: null,
        from: null,
        to: null,
      },
      evidenceRefs: [{
        kind: "smoke",
        id: "local-agent-boundary",
        label: "Local Agent ASIN boundary smoke",
        observedAt: null,
      }],
      snapshotRefs: [{
        kind: "smoke",
        id: "local-agent-boundary",
        label: "Local Agent ASIN boundary smoke",
        observedAt: null,
      }],
      confidence: 0.1,
    }],
    freshness: {
      status: "missing",
      checkedAt: new Date().toISOString(),
      maxAgeHours: 24,
      oldestEvidenceAt: null,
      staleSources: ["category"],
      dataGaps: ["Isolated ASIN smoke has no business evidence"],
      warnings: [],
    },
    riskNotes: [],
    recommendedActions: [{
      type: "recollect",
      title: "Queue a category recollection",
      rationale: "The isolated smoke database has no fresh category evidence.",
      riskLevel: "L2",
      requiresApproval: true,
      payload: {
        taskType: "category",
        targetId: 1,
        date: new Date().toISOString().slice(0, 10),
      },
    }],
  };
}

async function startModelStub() {
  const output = outputForSmoke();
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      stream: body.includes('"stream":true'),
    });
    if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [
      {
        id: "chatcmpl-amazon-monitor-smoke",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "amazon-monitor-local-smoke",
        choices: [{
          index: 0,
          delta: { role: "assistant", content: JSON.stringify(output) },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-amazon-monitor-smoke",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "amazon-monitor-local-smoke",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];
    response.writeHead(200, {
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "content-type": "text/event-stream",
    });
    chunks.forEach((chunk) => response.write(`data: ${JSON.stringify(chunk)}\n\n`));
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address !== "object" || !address.port) {
    server.close();
    throw new Error("Local Agent model stub did not expose a port");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise((resolvePromise) => server.close(() => resolvePromise())),
    requests,
  };
}

async function rendererPage(debugPort) {
  const target = await waitFor("packaged renderer", () => rendererTarget(debugPort));
  const { chromium } = desktopRequire("playwright");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url() === target.url) ?? pages[0];
  if (!page) {
    await browser.close();
    throw new Error("Packaged Electron did not expose an Agent smoke renderer page");
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

async function runSmoke(executablePath) {
  const executable = resolve(executablePath);
  if (!existsSync(executable)) throw new Error(`Packaged executable was not found: ${executable}`);
  const userDataRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-package-agent-runtime-"));
  mkdirSync(userDataRoot, { recursive: true });
  const debugPort = await findFreePort();
  const modelStub = await startModelStub();
  const output = [];
  const child = spawn(executable, [
    `--user-data-dir=${userDataRoot}`,
    `--remote-debugging-port=${debugPort}`,
    "--disable-gpu",
  ], {
    cwd: dirname(executable),
    env: {
      ...process.env,
      AGENT_SDK_ENABLED: "true",
      DB_PATH: join(userDataRoot, "isolated.sqlite"),
      NODE_ENV: "production",
    },
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
    const readiness = await waitFor("packaged API readiness", async () => {
      const response = await fetchJson(`${origin}/api/ready`);
      return response.status === 200 && response.body?.ok ? response.body : undefined;
    });
    const registration = await pageApi(page, "/api/auth/register-first-user", {
      method: "POST",
      body: JSON.stringify({
        username: "agent-smoke-admin",
        password: "AgentSmokePassword!2026",
        displayName: "Agent Runtime Smoke",
      }),
    });
    if (registration.status !== 201) {
      throw new Error(`Agent smoke bootstrap failed: ${registration.status} ${registration.text}`);
    }
    const connection = await page.evaluate(async (baseUrl) => {
      if (!window.amazonMonitorDesktop?.model) throw new Error("Desktop model bridge is unavailable");
      return window.amazonMonitorDesktop.model.save({
        name: "Local Agent Runtime Smoke",
        provider: "openai-compatible",
        apiMode: "chat-completions",
        baseUrl,
        primaryModel: "amazon-monitor-local-smoke",
        fallbackModel: "amazon-monitor-local-smoke",
        reasoningEnabled: false,
        apiKey: "local-agent-runtime-smoke-key",
      });
    }, modelStub.baseUrl);
    const session = await waitFor("Agent runtime enablement", async () => {
      const response = await pageApi(page, "/api/agent/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "Packaged Agent runtime smoke" }),
      });
      if (response.status === 503) return undefined;
      if (response.status !== 201) {
        throw new Error(`Agent session creation failed: ${response.status} ${response.text}`);
      }
      return response.body;
    }, 30_000);
    const createdRun = await pageApi(page, `/api/agent/sessions/${session.id}/runs`, {
      method: "POST",
      body: JSON.stringify({
        input: "调查 B000TEST01 最近 30 天的竞争态势",
        taskType: "investigation",
        freshness: {
          datasets: ["category", "keyword", "price", "promotion", "review"],
          categoryId: 1,
          keywordId: 1,
          asin: "B000TEST01",
          marketplace: "ATVPDKIKX0DER",
          maxAgeHours: 24,
        },
      }),
    });
    if (createdRun.status !== 202) {
      throw new Error(`Agent run creation failed: ${createdRun.status} ${createdRun.text}`);
    }
    const run = await waitFor("packaged Agent run terminal state", async () => {
      const response = await pageApi(page, `/api/agent/runs/${createdRun.body.id}`);
      if (response.status !== 200) throw new Error(`Agent run read failed: ${response.status}`);
      return ["completed", "failed", "cancelled", "waiting_approval"].includes(response.body.status)
        ? response.body
        : undefined;
    }, 60_000);
    if (run.status !== "waiting_approval") {
      throw new Error(`Packaged Agent smoke did not reach approval: ${run.status} ${run.errorMessage ?? ""}`);
    }
    const eventTypes = run.events.map((event) => event.type);
    const toolCallTypes = run.toolCalls.map((call) => `${call.toolName}:${call.status}`);
    const requiredEvents = ["planning.started", "freshness.completed", "model.started", "run.completed"];
    const missingEvents = requiredEvents.filter((type) => !eventTypes.includes(type));
    const requiredToolNames = [
      "check_data_freshness",
      "get_asin_history",
      "get_keyword_ranking",
      "get_price_history",
      "get_promotion_timeline",
      "get_review_growth",
    ];
    const missingTools = requiredToolNames.filter((toolName) => (
      !toolCallTypes.includes(`${toolName}:completed`)
    ));
    if (missingEvents.length > 0 || missingTools.length > 0) {
      throw new Error(`Packaged Agent smoke evidence is incomplete: ${JSON.stringify({ missingEvents, missingTools, toolCallTypes })}`);
    }
    const proposal = run.proposals.find((candidate) => (
      candidate.actionType === "recollect" && candidate.status === "pending"
    ));
    if (!proposal) throw new Error(`Packaged Agent smoke proposal is missing: ${JSON.stringify(run.proposals)}`);
    const approved = await pageApi(page, `/api/agent/actions/${proposal.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: proposal.expectedVersion }),
    });
    if (
      approved.status !== 200
      || approved.body?.proposal?.status !== "completed"
      || approved.body?.execution?.status !== "completed"
    ) {
      throw new Error(`Packaged Agent approval execution failed: ${approved.status} ${approved.text}`);
    }
    const executionId = approved.body.execution.id;
    const recoveryRunId = approved.body.execution.result?.recoveryRunId;
    if (!Number.isInteger(recoveryRunId)) {
      throw new Error(`Packaged Agent recollection did not create a recovery run: ${approved.text}`);
    }
    const repeatedApproval = await pageApi(page, `/api/agent/actions/${proposal.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: proposal.expectedVersion }),
    });
    if (repeatedApproval.status !== 200 || repeatedApproval.body?.execution?.id !== executionId) {
      throw new Error(`Packaged Agent repeated approval was not idempotent: ${repeatedApproval.status} ${repeatedApproval.text}`);
    }
    const recovery = await pageApi(page, `/api/agent/runs/${recoveryRunId}`);
    if (
      recovery.status !== 200
      || !recovery.body?.events?.some((event) => event.type === "recovery.waiting_for_collection")
    ) {
      throw new Error(`Packaged Agent recovery linkage failed: ${recovery.status} ${recovery.text}`);
    }
    const audit = await pageApi(page, `/api/agent/audit?runId=${run.id}`);
    if (
      audit.status !== 200
      || !Array.isArray(audit.body?.runs)
      || audit.body.runs.length !== 1
      || audit.body.runs[0]?.id !== run.id
      || audit.body.runs[0]?.proposals?.[0]?.approvals?.length !== 1
      || audit.body.runs[0]?.proposals?.[0]?.executions?.length !== 1
    ) {
      throw new Error(`Packaged Agent audit export failed: ${audit.status} ${audit.text}`);
    }
    const eventStream = await pageApi(page, `/api/agent/runs/${run.id}/events`, {
      headers: { "Last-Event-ID": "0" },
    });
    if (eventStream.status !== 200 || !eventStream.text.includes("run.completed")) {
      throw new Error(`Packaged Agent SSE replay failed: ${eventStream.status} ${eventStream.text}`);
    }
    const processOutput = output.join("");
    if (processOutput.includes("local-agent-runtime-smoke-key")) {
      throw new Error("Packaged Agent process output contained the configured API key");
    }
    const processStatus = await page.evaluate(() => window.amazonMonitorDesktop?.processStatus());
    const statuses = processStatus ?? {};
    if (statuses.api !== "running" || statuses.agent !== "running" || statuses.crawler !== "running") {
      throw new Error(`Unexpected packaged process status: ${JSON.stringify(statuses)}`);
    }
    return {
      ok: true,
      executable,
      debugPort,
      rendererOrigin: origin,
      readiness,
      connection: {
        activeConnectionId: connection.activeConnectionId,
        configuredConnections: connection.connections.filter((item) => item.configured).length,
      },
      run: {
        id: run.id,
        status: run.status,
        eventTypes,
        toolCallTypes,
        requiredToolNames,
        businessEvidence: false,
        freshnessStatus: run.output?.freshness.status ?? null,
      },
      action: {
        proposalId: proposal.id,
        status: approved.body.proposal.status,
        executionId,
        recoveryRunId,
        repeatedApprovalExecutionId: repeatedApproval.body.execution.id,
      },
      audit: {
        status: audit.status,
        runCount: audit.body.runs.length,
        eventStreamReplayedTerminal: true,
      },
      processStatus: statuses,
      stubProvider: {
        requestCount: modelStub.requests.length,
        requests: modelStub.requests,
      },
      outputLines: output.join("").trim().split(/\r?\n/).filter(Boolean).slice(-10),
    };
  } finally {
    await browser?.close();
    await modelStub.close();
    const terminated = terminateProcessTree(child.pid);
    await new Promise((resolvePromise) => {
      if (child.exitCode !== null) {
        resolvePromise();
        return;
      }
      const timeout = setTimeout(resolvePromise, 15_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
    rmSync(userDataRoot, { force: true, recursive: true });
    if (child.exitCode === null) {
      throw new Error(
        `Could not terminate packaged Agent smoke process tree rooted at PID ${child.pid}`
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
      reason: "Packaged Agent runtime smoke is only supported on Windows.",
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
