export const SHADOW_PACKAGE_REQUIRED_FILES = [
  "README.md",
  "preflight.json",
  "evidence.json",
  "run-lineage.csv",
  "reconciliation.csv",
  "checksums.txt",
  "signoff.md",
] as const;

export const SHADOW_PACKAGE_REQUIRED_PREFLIGHT_CHECKS = [
  "config_window",
  "database_isolated",
  "connector_enabled",
  "fixture_disabled",
  "user_data_isolated",
  "runtime_database_binding",
  "backup_artifact",
  "sqlite_storage",
  "organization_boundary",
  "data_source_boundary",
  "commerce_store_boundary",
  "sp_api_connection",
  "connection_store_link",
  "fact_boundary",
] as const;

export const SHADOW_PACKAGE_REQUIRED_PREFLIGHT_SCOPE_FIELDS = [
  "evidenceBundleId",
  "organizationId",
  "commerceStoreId",
  "sourceId",
  "marketplace",
  "currency",
  "businessTimezone",
  "windowStart",
  "windowEnd",
] as const;

export const SHADOW_PACKAGE_REQUIRED_STORAGE_THRESHOLDS = [
  "requireWal",
  "maxWalBytes",
  "maxTotalBytes",
] as const;

export const SHADOW_PACKAGE_FORBIDDEN_EXTENSIONS = new Set([
  ".sqlite",
  ".sqlite3",
  ".db",
  ".db3",
  ".env",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
]);

export const SHADOW_PACKAGE_TEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

export const SHADOW_PACKAGE_SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|api[-_]?key|cookie/i;

export const SHADOW_PACKAGE_SIGNOFF_ROLES = [
  { name: "product owner", pattern: /product\s+owner|产品负责人/i },
  { name: "data owner", pattern: /data\s+owner|数据负责人/i },
  { name: "release owner", pattern: /release\s+owner|发布负责人/i },
] as const;

export const SHADOW_PACKAGE_SIGNED_MARKER_PATTERN = /\bsigned\b|\bapproved\b|已签(?:字)?|批准|✅|\[[xX]\]/i;
export const SHADOW_PACKAGE_UNSIGNED_MARKER_PATTERN = /\bnot\s+signed\b|\bunsigned\b|\bpending\b|未签|待签|待审批/i;

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /(?:access|refresh)[-_]?token\s*[:=]/i,
  /client[-_]?secret\s*[:=]/i,
  /(?:api[-_]?key|password|smtp[-_]?pass)\s*[:=]/i,
  /\bsk-[A-Za-z0-9]/,
];

export function containsCredentialLikeText(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsCredentialLikeJsonField(value: unknown): boolean {
  if (typeof value === "string") return containsCredentialLikeText(value);
  if (Array.isArray(value)) return value.some(containsCredentialLikeJsonField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    SHADOW_PACKAGE_SENSITIVE_KEY_PATTERN.test(key) || containsCredentialLikeJsonField(nested)
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
