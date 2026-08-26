import type { AgentOsResourceId, JsonObject, JsonValue } from "./types.js";

export function serializeJson(value: JsonValue | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function serializeRequiredJson(value: JsonValue): string {
  return JSON.stringify(value);
}

export function serializeResourceId(value: AgentOsResourceId | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function serializeStringArray(value: string[] | undefined): string {
  return JSON.stringify(value ?? []);
}

export function parseJsonValue(value: string | null, field: string): JsonValue | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${field}`, { cause: error });
  }
  if (!isJsonValue(parsed)) {
    throw new Error(`Invalid JSON value in ${field}`);
  }
  return parsed;
}

export function parseRequiredJson(value: string | null, field: string): JsonValue {
  if (value === null) {
    throw new Error(`Missing JSON value in ${field}`);
  }
  const parsed = parseJsonValue(value, field);
  if (parsed === null && value.trim() !== "null") {
    throw new Error(`Missing JSON value in ${field}`);
  }
  return parsed as JsonValue;
}

export function parseJsonObject(value: string, field: string): JsonObject {
  const parsed = parseRequiredJson(value, field);
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected JSON object in ${field}`);
  }
  return parsed;
}

export function parseStringArray(value: string, field: string): string[] {
  const parsed = parseRequiredJson(value, field);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`Expected string array in ${field}`);
  }
  return parsed.filter((item): item is string => typeof item === "string");
}

export function parseResourceId(value: string | null, field: string): AgentOsResourceId | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid resource id in ${field}`, { cause: error });
  }
  if ((typeof parsed !== "string" && typeof parsed !== "number") ||
      (typeof parsed === "number" && !Number.isFinite(parsed))) {
    throw new Error(`Invalid resource id in ${field}`);
  }
  return parsed;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(isJsonValue);
}
