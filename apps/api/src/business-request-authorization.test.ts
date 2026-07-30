import type { UserRole } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import { canModifyBusinessRequest, requiredBusinessCapability, type BusinessRequest } from "./business-request-authorization.js";

const collectionOperations: readonly BusinessRequest[] = [
  { method: "POST", path: "/api/collect/run" },
  { method: "POST", path: "/api/collectors/run" },
  { method: "POST", path: "/api/categories/collect/run" },
  { method: "POST", path: "/api/categories/12/collect" },
  { method: "POST", path: "/api/data-sources/12/sync" }
];

const collectionRoles: readonly UserRole[] = ["admin", "manager", "operator"];
const nonCollectionRoles: readonly UserRole[] = ["ads_operator", "product_researcher", "viewer", "developer"];

describe("business request authorization", () => {
  it.each(collectionOperations)("maps $method $path to manage_collection", (request) => {
    expect(requiredBusinessCapability(request)).toBe("manage_collection");
  });

  it.each(collectionRoles)("allows %s to submit every collection operation", (role) => {
    for (const request of collectionOperations) {
      expect(canModifyBusinessRequest(role, request)).toBe(true);
    }
  });

  it.each(nonCollectionRoles)("denies %s from every collection operation", (role) => {
    for (const request of collectionOperations) {
      expect(canModifyBusinessRequest(role, request)).toBe(false);
    }
  });

  it("keeps worker restart restricted to administrators", () => {
    const restartWorker: BusinessRequest = { method: "POST", path: "/api/collectors/worker-restart" };
    expect(canModifyBusinessRequest("admin", restartWorker)).toBe(true);
    for (const role of collectionRoles.filter((role) => role !== "admin")) {
      expect(canModifyBusinessRequest(role, restartWorker)).toBe(false);
    }
  });

  it("keeps data source configuration under manage_data_sources", () => {
    const createDataSource: BusinessRequest = { method: "POST", path: "/api/data-sources" };
    expect(canModifyBusinessRequest("admin", createDataSource)).toBe(true);
    expect(canModifyBusinessRequest("manager", createDataSource)).toBe(false);
  });
});
