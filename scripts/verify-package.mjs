import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { listPackage } from "@electron/asar";
import { findForbiddenPackageEntries } from "./package-security-policy.mjs";

function listPackageRootFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      const relativeEntryPath = relative(root, entryPath);
      if (
        !relativeEntryPath
        || isAbsolute(relativeEntryPath)
        || relativeEntryPath === ".."
        || relativeEntryPath.startsWith(`..${sep}`)
      ) {
        throw new Error(`Package entry escaped package root: ${entryPath}`);
      }

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        visit(entryPath);
      } else {
        files.push(relativeEntryPath);
      }
    }
  }

  visit(root);
  return files;
}

const packageRoot = resolve(process.argv[2] ?? "release/electron/win-unpacked");
const asarPath = resolve(packageRoot, "resources", "app.asar");
if (!existsSync(asarPath)) {
  throw new Error(`Packaged app.asar was not found: ${asarPath}`);
}

const entries = listPackage(asarPath);
const packageRootEntries = listPackageRootFiles(packageRoot);
const forbidden = findForbiddenPackageEntries([...entries, ...packageRootEntries]);

const summary = {
  packageRoot,
  asarPath,
  entries: entries.length,
  packageRootEntries: packageRootEntries.length,
  forbiddenEntries: forbidden.length,
  forbiddenSample: forbidden.slice(0, 20),
};
console.log(JSON.stringify(summary, null, 2));

if (forbidden.length > 0) {
  throw new Error(`Package contains ${forbidden.length} forbidden release entries`);
}
