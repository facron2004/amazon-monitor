const SENSITIVE_FILE_NAME_PATTERN = /(^|\/)(?:\.env(?:\.[^/]*)?|\.cookie(?:\.(?:cache|json|txt|jar|store|session))?|(?:[^/]+[._-])?cookies?\.(?:cache|json|txt|jar|store|session)|(?:credentials?|secrets?)\.(?:json|ya?ml|toml|ini|env)|id_rsa(?:\.[^/]*)?)(?:\/|$)/i;
const SENSITIVE_EXTENSION_PATTERN = /\.(?:sqlite|sqlite3|db|db3)(?:[-.](?:wal|shm|journal|new))?$|\.(?:log|pem|key|p12|pfx|crt|cer)$/i;
const SENSITIVE_DIRECTORY_PATTERN = /(^|\/)(?:\.review-package-stage|logs?)(?:\/|$)/i;
const TEMP_DIRECTORY_PATTERN = /(^|\/)tmp(?:\/|$)/i;
const FIRST_PARTY_PACKAGE_PREFIX = "/node_modules/@amazon-monitor/";
const FIRST_PARTY_SOURCE_PATTERN = /\/src(?:\/|$)|\.(?:test|spec)\.[^/]+$|\.map$/i;

export function normalizePackageEntry(entry) {
  return `/${String(entry).replaceAll("\\", "/").replace(/^\/+/, "")}`;
}

function isDirectFirstPartyEntry(entry) {
  return entry.startsWith(FIRST_PARTY_PACKAGE_PREFIX)
    && !entry.slice(1).includes("/node_modules/");
}

function isSensitivePackageEntry(entry) {
  if (SENSITIVE_FILE_NAME_PATTERN.test(entry) || SENSITIVE_EXTENSION_PATTERN.test(entry)) {
    return true;
  }
  if (SENSITIVE_DIRECTORY_PATTERN.test(entry)) {
    return true;
  }
  if (TEMP_DIRECTORY_PATTERN.test(entry) && !entry.includes("/node_modules/")) {
    return true;
  }
  return isDirectFirstPartyEntry(entry) && FIRST_PARTY_SOURCE_PATTERN.test(entry);
}

export function findForbiddenPackageEntries(entries) {
  return entries.map(normalizePackageEntry).filter(isSensitivePackageEntry);
}
