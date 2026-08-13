import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assembleShadowEvidencePackage } from "./assemble-sp-api-shadow-package.js";

interface CliOptions {
  sourceDirectory: string | undefined;
  outputDirectory: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  let sourceDirectory: string | undefined;
  let outputDirectory: string | undefined;
  for (const argument of argv) {
    if (argument.startsWith("--source-dir=")) sourceDirectory = argument.slice("--source-dir=".length);
    else if (argument.startsWith("--output=")) outputDirectory = argument.slice("--output=".length);
    else throw new Error(`Unknown option: ${argument}`);
  }
  return { sourceDirectory, outputDirectory };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.sourceDirectory || !options.outputDirectory) {
      throw new Error("Usage: npm run assemble:sp-api-shadow-package -- --source-dir=<input-directory> --output=<new-package-directory>");
    }
    const result = assembleShadowEvidencePackage({
      sourceDirectory: resolve(options.sourceDirectory),
      outputDirectory: resolve(options.outputDirectory),
    });
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
