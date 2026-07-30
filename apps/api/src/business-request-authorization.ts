import { hasBusinessCapability, type BusinessCapability, type UserRole } from "@amazon-monitor/shared";

export interface BusinessRequest {
  method: string;
  path: string;
}

const collectionWritePaths: readonly RegExp[] = [
  /^\/api\/collect\/run$/,
  /^\/api\/collectors\/run$/,
  /^\/api\/categories\/collect\/run$/,
  /^\/api\/categories\/\d+\/collect$/,
  /^\/api\/data-sources\/\d+\/sync$/
];

export function requiredBusinessCapability(request: BusinessRequest): BusinessCapability | null {
  if (request.method === "POST" && collectionWritePaths.some((path) => path.test(request.path))) {
    return "manage_collection";
  }
  return null;
}

export function canModifyBusinessRequest(role: UserRole, request: BusinessRequest): boolean {
  if (request.method === "POST" && request.path === "/api/collectors/worker-restart") {
    return role === "admin";
  }

  const capability = requiredBusinessCapability(request);
  if (capability) {
    return hasBusinessCapability(role, capability);
  }

  if (request.path.endsWith("/profit-setting")) {
    return hasBusinessCapability(role, "manage_profit");
  }
  if (
    request.path.startsWith("/api/ads")
    || request.path === "/api/ai/analyze-ads"
  ) {
    return hasBusinessCapability(role, "manage_ads");
  }
  if (
    request.path.startsWith("/api/competitors")
    || request.path.startsWith("/api/asin-watch-states")
  ) {
    return hasBusinessCapability(role, "manage_competitors");
  }
  if (request.path === "/api/ai/analyze-competitor") {
    return hasBusinessCapability(role, "manage_competitors");
  }
  if (request.path === "/api/ai/create-report") {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/ai")) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  if (request.path.startsWith("/api/data-sources") || request.path.startsWith("/api/stores")) {
    return hasBusinessCapability(role, "manage_data_sources");
  }
  if (request.path.startsWith("/api/promotions")) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  if (request.path.startsWith("/api/reports")) {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/notifications")) {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/rules")) {
    return hasBusinessCapability(role, "manage_rules");
  }
  if (
    request.path.startsWith("/api/tasks")
    || request.path.startsWith("/api/sops")
    || request.path.startsWith("/api/insight-events")
  ) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  return role === "admin" || role === "operator";
}
