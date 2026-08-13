import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceBundle } from "./sp-api-shadow-evidence-validation.js";

interface CliOptions {
  inputPath: string | undefined;
  allowExample: boolean;
  requireAllPass: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let inputPath: string | undefined;
  let allowExample = false;
  let requireAllPass = true;
  for (const argument of argv) {
    if (argument === "--allow-example") allowExample = true;
    else if (argument === "--report-only") requireAllPass = false;
    else if (!argument.startsWith("-") && !inputPath) inputPath = argument;
  }
  return { inputPath, allowExample, requireAllPass };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.inputPath) {
    console.error("Usage: npm run verify:sp-api-shadow-evidence -- <evidence.json> [--allow-example] [--report-only]");
    process.exitCode = 1;
    return;
  }
  try {
    const input = JSON.parse(await readFile(resolve(options.inputPath), "utf8")) as unknown;
    const result = validateEvidenceBundle(input, options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
