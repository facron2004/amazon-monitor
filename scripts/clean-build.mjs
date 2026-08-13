import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildDirectories = [
  "packages/shared/dist",
  "apps/agent/dist",
  "apps/api/dist",
  "apps/web/dist",
  "apps/desktop/dist",
];

for (const relativePath of buildDirectories) {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to clean path outside repository: ${target}`);
  }
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
