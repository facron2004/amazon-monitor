import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const httpMethods = ["get", "post", "put", "patch", "delete"] as const;
const routePattern = /app\.(get|post|put|patch|delete)\("([^"\n]+)"/g;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const allowedUndocumentedOperations = new Set(["GET /openapi.json", "GET /api-docs"]);

describe("OpenAPI route contract", () => {
  it("keeps Express operations and OpenAPI operations bidirectionally synchronized", () => {
    const expressOperations = collectExpressOperations();
    const documentedOperations = collectOpenApiOperations();

    const undocumented = [...expressOperations]
      .filter((operation) => !documentedOperations.has(operation) && !allowedUndocumentedOperations.has(operation))
      .sort();
    const ghostOperations = [...documentedOperations]
      .filter((operation) => !expressOperations.has(operation))
      .sort();

    expect(undocumented).toEqual([]);
    expect(ghostOperations).toEqual([]);
  });

  it("documents HttpOnly session authentication without a browser-readable token field", () => {
    const document = readOpenApiDocument();
    const components = recordValue(document.components, "components");
    const securitySchemes = recordValue(components.securitySchemes, "components.securitySchemes");
    const sessionCookie = recordValue(securitySchemes.SessionCookie, "components.securitySchemes.SessionCookie");
    const paths = recordValue(document.paths, "paths");
    const credentialPath = recordValue(paths["/data-sources/{id}/sp-api/credentials"], "SP-API credential path");
    const credentialOperation = recordValue(credentialPath.post, "SP-API credential operation");
    const requestBody = recordValue(credentialOperation.requestBody, "SP-API credential request body");
    const content = recordValue(requestBody.content, "SP-API credential request content");
    const jsonContent = recordValue(content["application/json"], "SP-API credential request JSON");
    const schema = recordValue(jsonContent.schema, "SP-API credential request schema");
    const properties = recordValue(schema.properties, "SP-API credential request properties");

    expect(sessionCookie).toMatchObject({ type: "apiKey", in: "cookie", name: "amazon_monitor_session" });
    expect(properties.lwaClientSecret).toMatchObject({ writeOnly: true });
    expect(properties.lwaRefreshToken).toMatchObject({ writeOnly: true });
    expect(JSON.stringify(collectResponseContracts(document))).not.toMatch(/refresh[_-]?token|access[_-]?token/i);
  });
});

function collectResponseContracts(document: Record<string, unknown>): unknown[] {
  const paths = recordValue(document.paths, "paths");
  const responses: unknown[] = [];
  for (const pathItem of Object.values(paths)) {
    const item = recordValue(pathItem, "path item");
    for (const method of httpMethods) {
      const operation = item[method];
      if (operation === undefined) continue;
      responses.push(recordValue(operation, "operation").responses);
    }
  }
  return responses;
}

function collectExpressOperations(): Set<string> {
  const routeDirectory = join(sourceDirectory, "routes");
  const sourceFiles = [
    ...readdirSync(routeDirectory)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => join(routeDirectory, file)),
    join(sourceDirectory, "server.ts")
  ];
  const operations = new Set<string>();

  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(routePattern)) {
      operations.add(`${match[1].toUpperCase()} ${normalizeRoutePath(match[2])}`);
    }
  }

  return operations;
}

function collectOpenApiOperations(): Set<string> {
  const document = readOpenApiDocument();
  const paths = recordValue(document.paths, "paths");
  const operations = new Set<string>();

  for (const [path, pathItem] of Object.entries(paths)) {
    const item = recordValue(pathItem, `paths.${path}`);
    for (const method of httpMethods) {
      if (item[method] !== undefined) {
        operations.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  return operations;
}

function readOpenApiDocument(): Record<string, unknown> {
  return recordValue(JSON.parse(readFileSync(join(sourceDirectory, "openapi.json"), "utf8")), "OpenAPI document");
}

function normalizeRoutePath(path: string): string {
  return path.replace(/^\/api\//, "/").replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
