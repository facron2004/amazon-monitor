import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyShadowEvidencePackage } from "./verify-sp-api-shadow-package.js";

async function main(): Promise<void> {
  const packagePath = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
  if (!packagePath) {
    console.error("Usage: npm run verify:sp-api-shadow-package -- <package-directory>");
    process.exitCode = 1;
    return;
  }
  try {
    const result = verifyShadowEvidencePackage(resolve(packagePath));
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
