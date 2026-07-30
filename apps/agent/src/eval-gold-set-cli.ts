import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  agentGoldLiveScopeSchema,
  runLiveAgentGoldEvaluation,
} from "./eval-gold-set-live.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", default: "http://127.0.0.1:43210" },
      output: { type: "string" },
      scope: { type: "string" },
      username: { type: "string" },
    },
    strict: true,
  });
  const password = process.env.AGENT_EVAL_PASSWORD;
  if (!password) {
    throw new Error(
      "AGENT_EVAL_PASSWORD is required; do not pass credentials on the command line",
    );
  }
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const scope = values.scope
    ? agentGoldLiveScopeSchema.parse(
        JSON.parse(
          await readFile(resolve(invocationRoot, values.scope), "utf8"),
        ) as unknown,
      )
    : undefined;
  const outputPath = resolve(invocationRoot, values.output ?? defaultOutputPath());
  const report = await runLiveAgentGoldEvaluation({
    baseUrl: values["base-url"],
    username: values.username ?? process.env.AGENT_EVAL_USERNAME ?? "admin",
    password,
    scope,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
  if (
    report.pendingAnnotations.alertValidity.length > 0
    || report.pendingAnnotations.recovery.length > 0
    || Object.values(report.targetStatus).some((passed) => !passed)
  ) {
    process.exitCode = 2;
  }
}

function defaultOutputPath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `output/agent-gold-evaluation-${timestamp}.json`;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Gold evaluation failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
