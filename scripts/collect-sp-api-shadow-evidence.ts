import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectShadowEvidence,
} from "./sp-api-shadow-evidence-collector.js";
import { validateEvidenceBundle } from "./sp-api-shadow-evidence-validation.js";
import { parseShadowEvidenceConfig } from "./sp-api-shadow-evidence-config.js";

interface CliOptions {
  configPath: string | undefined;
  outputPath: string | undefined;
  requireAllPass: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let requireAllPass = false;
  for (const argument of argv) {
    if (argument === "--require-all-pass") requireAllPass = true;
    else if (argument.startsWith("--output=")) outputPath = argument.slice("--output=".length);
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (!configPath) configPath = argument;
    else throw new Error("Only one collector config path may be provided");
  }
  return { configPath, outputPath, requireAllPass };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.configPath) throw new Error("Usage: npm run collect:sp-api-shadow-evidence -- <config.json> [--output=manifest.json] [--require-all-pass]");
    const configPath = resolve(options.configPath);
    const rawConfig = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    const config = parseShadowEvidenceConfig(rawConfig, dirname(configPath));
    const result = collectShadowEvidence(config);
    const validation = options.requireAllPass
      ? validateEvidenceBundle(result.bundle, { requireAllPass: true })
      : result.validation;
    const output = JSON.stringify(result.bundle, null, 2);
    if (options.outputPath) {
      const outputPath = resolve(options.outputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${output}\n`, "utf8");
    } else {
      console.log(output);
    }
    if (!validation.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
