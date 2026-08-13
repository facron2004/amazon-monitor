import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const distRoot = resolve(process.argv[2] ?? "apps/web/dist");
const htmlPath = resolve(distRoot, "index.html");
const initialCssBudget = Number(process.env.WEB_INITIAL_CSS_BUDGET_KB ?? 160) * 1024;
const initialJsBudget = Number(process.env.WEB_INITIAL_JS_BUDGET_KB ?? 300) * 1024;

function assetPath(reference) {
  const relative = decodeURIComponent(reference).replace(/^\//, "");
  const absolute = resolve(distRoot, relative);
  const root = distRoot.endsWith(sep) ? distRoot : `${distRoot}${sep}`;
  if (!absolute.startsWith(root)) {
    throw new Error(`Asset reference escapes the web dist directory: ${reference}`);
  }
  return absolute;
}

function readInitialAssets() {
  if (!existsSync(htmlPath)) {
    throw new Error(`Web entrypoint was not found: ${htmlPath}`);
  }
  const html = readFileSync(htmlPath, "utf8");
  const references = [];
  const linkPattern = /<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
  const scriptPattern = /<script\b[^>]*src=["']([^"']+\.js)["'][^>]*>/gi;
  for (const match of html.matchAll(linkPattern)) references.push({ kind: "css", reference: match[1] });
  for (const match of html.matchAll(scriptPattern)) references.push({ kind: "js", reference: match[1] });
  if (references.length === 0) {
    throw new Error(`Web entrypoint does not reference an initial CSS or JavaScript asset: ${htmlPath}`);
  }
  return references.map(({ kind, reference }) => {
    const path = assetPath(reference);
    if (!existsSync(path)) throw new Error(`Initial web asset was not found: ${path}`);
    return { kind, reference, path, bytes: statSync(path).size };
  });
}

const initialAssets = readInitialAssets();
const initialCssBytes = initialAssets
  .filter((asset) => asset.kind === "css")
  .reduce((total, asset) => total + asset.bytes, 0);
const initialJsBytes = initialAssets
  .filter((asset) => asset.kind === "js")
  .reduce((total, asset) => total + asset.bytes, 0);
const result = {
  distRoot,
  initialAssets,
  initialCssBytes,
  initialJsBytes,
  budgets: { initialCssBytes: initialCssBudget, initialJsBytes: initialJsBudget },
  ok: initialCssBytes <= initialCssBudget && initialJsBytes <= initialJsBudget,
};
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  throw new Error(
    `Initial web bundle exceeds budget (CSS ${initialCssBytes}/${initialCssBudget}, JS ${initialJsBytes}/${initialJsBudget})`,
  );
}
