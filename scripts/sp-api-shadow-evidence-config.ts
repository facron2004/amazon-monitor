import { resolve } from "node:path";
import { isRecord } from "./sp-api-shadow-evidence-day.js";
import type {
  ShadowEvidenceCollectorConfig,
  ShadowEvidenceExternalReference,
} from "./sp-api-shadow-evidence-collector-types.js";

export const CONFIG_KEYS = [
  "databasePath", "orgId", "dataSourceId", "commerceStoreId", "marketplace", "currency",
  "businessTimezone", "evidenceBundleId", "organizationEvidenceId", "commerceStoreEvidenceId",
  "sourceEvidenceId", "windowStart", "windowEnd", "externalReferences", "observedAtByDate",
] as const;

export function parseShadowEvidenceConfig(
  input: unknown,
  configDirectory: string,
): ShadowEvidenceCollectorConfig {
  if (!isRecord(input)) throw new Error("Collector config must be a JSON object");
  for (const key of Object.keys(input)) {
    if (!CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number])) throw new Error(`Unknown collector config field: ${key}`);
    if (/token|secret|password|authorization|api[-_]?key|cookie/i.test(key)) throw new Error(`Credential-like collector config field is forbidden: ${key}`);
  }
  return {
    databasePath: resolveConfigPath(requiredString(input, "databasePath"), configDirectory),
    orgId: requiredInteger(input, "orgId"),
    dataSourceId: requiredInteger(input, "dataSourceId"),
    commerceStoreId: requiredInteger(input, "commerceStoreId"),
    marketplace: requiredString(input, "marketplace"),
    currency: requiredString(input, "currency").toUpperCase(),
    businessTimezone: requiredString(input, "businessTimezone"),
    evidenceBundleId: requiredString(input, "evidenceBundleId"),
    organizationEvidenceId: requiredString(input, "organizationEvidenceId"),
    commerceStoreEvidenceId: requiredString(input, "commerceStoreEvidenceId"),
    sourceEvidenceId: requiredString(input, "sourceEvidenceId"),
    windowStart: requiredString(input, "windowStart"),
    windowEnd: requiredString(input, "windowEnd"),
    externalReferences: parseReferences(input.externalReferences),
    observedAtByDate: parseObservedAt(input.observedAtByDate),
  };
}

function resolveConfigPath(databasePath: string, configDirectory: string): string {
  return resolve(configDirectory, databasePath);
}

function parseReferences(value: unknown): Record<string, ShadowEvidenceExternalReference> {
  if (!isRecord(value)) throw new Error("externalReferences must be an object");
  return Object.fromEntries(Object.entries(value).map(([date, reference]) => {
    if (!isRecord(reference)) throw new Error(`externalReferences.${date} must be an object`);
    return [date, {
      reportId: requiredString(reference, "reportId", `externalReferences.${date}`),
      downloadedAt: requiredString(reference, "downloadedAt", `externalReferences.${date}`),
      sha256: requiredString(reference, "sha256", `externalReferences.${date}`),
    }];
  }));
}

function parseObservedAt(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error("observedAtByDate must be an object");
  return Object.fromEntries(Object.entries(value).map(([date, observedAt]) => {
    if (typeof observedAt !== "string" || observedAt.trim() === "") throw new Error(`observedAtByDate.${date} must be a non-empty string`);
    return [date, observedAt];
  }));
}

function requiredString(value: Record<string, unknown>, key: string, path = "config"): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") throw new Error(`${path}.${key} must be a non-empty string`);
  if (/^Bearer\s|(?:access|refresh)[-_]?token\s*=|client[-_]?secret\s*=/i.test(candidate)) throw new Error(`${path}.${key} contains a credential-like value`);
  return candidate;
}

function requiredInteger(value: Record<string, unknown>, key: string): number {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 1) throw new Error(`config.${key} must be a positive integer`);
  return candidate;
}
