import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECT_ENDPOINTS,
  DEFAULT_OPENAPI_PATH,
  DEFAULT_ROUTE_ROOT,
  extractExpressRoutes,
  loadOpenApiDocument,
  readRouteSources,
  verifyOpenApiCoverage,
} from "./verify-openapi-route-coverage.mjs";

describe("OpenAPI route coverage", () => {
  it("keeps the current API routes and direct endpoints in sync", () => {
    const result = verifyOpenApiCoverage({
      routeSources: readRouteSources(DEFAULT_ROUTE_ROOT),
      openapiDocument: loadOpenApiDocument(DEFAULT_OPENAPI_PATH),
    });

    expect(result).toMatchObject({
      ok: true,
      routeCount: 216,
      directEndpointCount: DEFAULT_DIRECT_ENDPOINTS.length,
      openApiCount: 221,
      missingRoutes: [],
      undocumentedOpenApi: [],
      duplicateRoutes: [],
    });
  });

  it("normalizes Express parameters and reports both sides of drift", () => {
    const result = verifyOpenApiCoverage({
      routeSources: [{
        sourcePath: "fixture.ts",
        source: [
          'app.get("/api/products/:id", handler);',
          'app.post("/api/products", handler);',
        ].join("\n"),
      }],
      openapiDocument: {
        paths: {
          "/products/{id}": { get: {} },
          "/products": { delete: {} },
        },
      },
      directEndpoints: [],
    });

    expect(result.ok).toBe(false);
    expect(result.missingRoutes).toEqual(["POST /products"]);
    expect(result.undocumentedOpenApi).toEqual(["DELETE /products"]);
  });

  it("reports duplicate route declarations instead of silently deduplicating them", () => {
    const result = verifyOpenApiCoverage({
      routeSources: [
        { sourcePath: "one.ts", source: 'app.get("/api/health", handler);' },
        { sourcePath: "two.ts", source: 'app.get("/api/health", handler);' },
      ],
      openapiDocument: { paths: { "/health": { get: {} } } },
      directEndpoints: [],
    });

    expect(result.ok).toBe(false);
    expect(result.duplicateRoutes).toEqual([{
      key: "GET /health",
      sources: ["one.ts", "two.ts"],
    }]);
  });

  it("extracts only literal app route registrations", () => {
    expect(extractExpressRoutes(
      'app.get("/api/items", handler); request.get("/not-a-route"); app.get(dynamicPath, handler);',
      "fixture.ts",
    )).toEqual([{
      key: "GET /items",
      method: "GET",
      path: "/items",
      sourcePath: "fixture.ts",
    }]);
  });
});
