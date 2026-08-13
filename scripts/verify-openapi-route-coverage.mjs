import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_ROUTE_ROOT = join(projectRoot, "apps", "api", "src", "routes");
export const DEFAULT_OPENAPI_PATH = join(projectRoot, "apps", "api", "src", "openapi.json");
export const HTTP_METHODS = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);
export const DEFAULT_DIRECT_ENDPOINTS = [
  "GET /dashboard/events-feed",
  "GET /dashboard/summary",
  "GET /dashboard/today-actions",
  "GET /health",
  "GET /ready",
];

const EXPRESS_ROUTE_PATTERN = /\bapp\.(get|post|put|patch|delete|options|head)\s*\(\s*(["'])([^"']+)\2/g;

export function normalizeRoutePath(path) {
  const withoutQuery = String(path).split("?")[0];
  const withoutApiPrefix = withoutQuery === "/api"
    ? "/"
    : withoutQuery.replace(/^\/api(?=\/)/, "");
  const withOpenApiParameters = withoutApiPrefix.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  return withOpenApiParameters.startsWith("/")
    ? withOpenApiParameters
    : `/${withOpenApiParameters}`;
}

export function extractExpressRoutes(source, sourcePath = "<inline>") {
  const routes = [];
  for (const match of source.matchAll(EXPRESS_ROUTE_PATTERN)) {
    const method = match[1].toUpperCase();
    const rawPath = match[3];
    routes.push({
      key: `${method} ${normalizeRoutePath(rawPath)}`,
      method,
      path: normalizeRoutePath(rawPath),
      sourcePath,
    });
  }
  return routes;
}

export function readRouteSources(routeRoot = DEFAULT_ROUTE_ROOT) {
  return readdirSync(routeRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const sourcePath = join(routeRoot, entry.name);
      return { sourcePath, source: readFileSync(sourcePath, "utf8") };
    });
}

function collectRouteEntries(routeSources) {
  return routeSources.flatMap(({ source, sourcePath }) => extractExpressRoutes(source, sourcePath));
}

function collectOpenApiEntries(openapiDocument) {
  if (!openapiDocument || typeof openapiDocument !== "object" || Array.isArray(openapiDocument)) {
    return { entries: [], issue: "OpenAPI document must be an object." };
  }
  const paths = openapiDocument.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return { entries: [], issue: "OpenAPI document must contain a paths object." };
  }
  const entries = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
    for (const method of Object.keys(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      entries.push({ key: `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), path });
    }
  }
  return { entries };
}

export function verifyOpenApiCoverage({
  routeSources,
  openapiDocument,
  directEndpoints = DEFAULT_DIRECT_ENDPOINTS,
}) {
  const routeEntries = collectRouteEntries(routeSources);
  const openApiResult = collectOpenApiEntries(openapiDocument);
  const issues = [];
  if (openApiResult.issue) issues.push(openApiResult.issue);

  const routeByKey = new Map();
  const duplicateRoutes = [];
  for (const route of routeEntries) {
    const previous = routeByKey.get(route.key);
    if (previous) {
      duplicateRoutes.push({ key: route.key, sources: [previous.sourcePath, route.sourcePath] });
      continue;
    }
    routeByKey.set(route.key, route);
  }

  const expectedKeys = new Set([...routeByKey.keys(), ...directEndpoints]);
  const openApiKeys = new Set(openApiResult.entries.map((entry) => entry.key));
  const missingRoutes = [...expectedKeys].filter((key) => !openApiKeys.has(key)).sort();
  const undocumentedOpenApi = [...openApiKeys].filter((key) => !expectedKeys.has(key)).sort();
  if (duplicateRoutes.length > 0) issues.push("Duplicate Express route declarations were found.");
  if (missingRoutes.length > 0) issues.push("Express routes or direct endpoints are missing from OpenAPI.");
  if (undocumentedOpenApi.length > 0) issues.push("OpenAPI operations do not have a matching Express route or direct endpoint.");

  return {
    ok: issues.length === 0,
    issues,
    routeCount: routeByKey.size,
    directEndpointCount: directEndpoints.length,
    openApiCount: openApiKeys.size,
    missingRoutes,
    undocumentedOpenApi,
    duplicateRoutes,
  };
}

export function loadOpenApiDocument(openapiPath = DEFAULT_OPENAPI_PATH) {
  return JSON.parse(readFileSync(openapiPath, "utf8"));
}

function parseArgument(args, name, fallback) {
  const prefix = `--${name}=`;
  const argument = args.find((value) => value.startsWith(prefix));
  return argument ? resolve(projectRoot, argument.slice(prefix.length)) : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const routeRoot = parseArgument(args, "route-root", DEFAULT_ROUTE_ROOT);
  const openapiPath = parseArgument(args, "openapi", DEFAULT_OPENAPI_PATH);
  const result = verifyOpenApiCoverage({
    routeSources: readRouteSources(routeRoot),
    openapiDocument: loadOpenApiDocument(openapiPath),
  });
  console.log(JSON.stringify({ routeRoot, openapiPath, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
