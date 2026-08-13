import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { ShadowEvidenceCollectorConfig } from "./sp-api-shadow-evidence-collector-types.js";
import type { ShadowPreflightCheck } from "./verify-sp-api-shadow-preflight-types.js";

const MARKETPLACE_ALIASES: Record<string, string> = {
  "amazon.com": "US",
  "amazon.ca": "CA",
  "amazon.com.mx": "MX",
  "amazon.com.au": "AU",
  "amazon.co.uk": "UK",
  "amazon.de": "DE",
  "amazon.es": "ES",
  "amazon.fr": "FR",
  "amazon.it": "IT",
  "amazon.nl": "NL",
  "amazon.se": "SE",
  "amazon.pl": "PL",
  "amazon.com.tr": "TR",
  "amazon.co.jp": "JP",
  "amazon.in": "IN",
  "amazon.sg": "SG",
  "amazon.ae": "AE",
  "amazon.sa": "SA",
  "amazon.com.br": "BR",
};

interface OrganizationRow {
  id: number;
}

interface DataSourceBoundaryRow {
  org_id: number;
  source_type: string;
  marketplace: string | null;
  status: string;
}

interface CommerceStoreBoundaryRow {
  org_id: number;
  platform: string;
  marketplace: string;
  status: string;
}

interface ConnectionBoundaryRow {
  data_source_id: number;
  org_id: number;
}

interface ConnectionStoreLinkRow {
  data_source_id: number;
  commerce_store_id: number;
}

interface CountRow {
  count: number;
}

const FACT_BOUNDARY_TABLES = [
  { name: "data_source_sync_runs", hasStore: false, hasMarketplace: false },
  { name: "data_source_override_audits", hasStore: false, hasMarketplace: false },
  { name: "sp_api_sales_traffic_daily", hasStore: true, hasMarketplace: true },
  { name: "sp_api_inventory_snapshots", hasStore: true, hasMarketplace: true },
  { name: "sp_api_inventory_latest", hasStore: true, hasMarketplace: true },
  { name: "data_source_domain_health", hasStore: true, hasMarketplace: true },
  { name: "data_source_mapping_issues", hasStore: true, hasMarketplace: true },
] as const;

export function readIdentityChecks(
  config: ShadowEvidenceCollectorConfig,
  databasePath: string,
): ShadowPreflightCheck[] {
  if (!existsSync(databasePath)) return identityFailureChecks("database does not exist");

  let database: DatabaseSync;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch (error) {
    return identityFailureChecks(error instanceof Error ? error.message : String(error));
  }

  try {
    const organization = database.prepare(
      "SELECT id FROM organizations WHERE id = ?",
    ).get(config.orgId) as unknown as OrganizationRow | undefined;
    const source = database.prepare(
      "SELECT org_id, source_type, marketplace, status FROM data_source_configs WHERE id = ?",
    ).get(config.dataSourceId) as unknown as DataSourceBoundaryRow | undefined;
    const commerceStore = database.prepare(
      "SELECT org_id, platform, marketplace, status FROM commerce_stores WHERE id = ?",
    ).get(config.commerceStoreId) as unknown as CommerceStoreBoundaryRow | undefined;
    const connection = database.prepare(
      "SELECT data_source_id, org_id FROM sp_api_connections WHERE data_source_id = ?",
    ).get(config.dataSourceId) as unknown as ConnectionBoundaryRow | undefined;
    const link = database.prepare(`
      SELECT cs.data_source_id, cs.commerce_store_id
      FROM sp_api_connection_stores cs
      JOIN sp_api_connections c ON c.data_source_id = cs.data_source_id
      JOIN commerce_stores s ON s.id = cs.commerce_store_id
      WHERE cs.data_source_id = ? AND cs.commerce_store_id = ?
        AND c.org_id = ? AND s.org_id = ?
    `).get(
      config.dataSourceId,
      config.commerceStoreId,
      config.orgId,
      config.orgId,
    ) as unknown as ConnectionStoreLinkRow | undefined;

    const sourceOrgOk = source?.org_id === config.orgId;
    const sourceTypeOk = source?.source_type === "amazon_sp_api";
    const sourceMarketplaceOk = source?.marketplace !== null
      && source?.marketplace !== undefined
      && marketplaceMatches(source.marketplace, config.marketplace);
    const storeOrgOk = commerceStore?.org_id === config.orgId;
    const storeMarketplaceOk = commerceStore !== undefined
      && marketplaceMatches(commerceStore.marketplace, config.marketplace);
    const connectionOk = connection?.data_source_id === config.dataSourceId
      && connection.org_id === config.orgId;
    const linkOk = link?.data_source_id === config.dataSourceId
      && link.commerce_store_id === config.commerceStoreId;

    return [
      {
        name: "organization_boundary",
        ok: organization?.id === config.orgId,
        detail: organization ? "organization exists" : "organization does not exist",
      },
      {
        name: "data_source_boundary",
        ok: sourceOrgOk && sourceTypeOk && sourceMarketplaceOk && source?.status !== "disabled",
        detail: describeSourceBoundary(source, config, sourceOrgOk, sourceTypeOk, sourceMarketplaceOk),
      },
      {
        name: "commerce_store_boundary",
        ok: storeOrgOk && storeMarketplaceOk && commerceStore?.platform === "amazon" && commerceStore.status === "active",
        detail: describeStoreBoundary(commerceStore, config, storeOrgOk, storeMarketplaceOk),
      },
      {
        name: "sp_api_connection",
        ok: connectionOk,
        detail: connectionOk
          ? "SP-API connection exists for the scoped source"
          : "SP-API connection is missing or crosses the organization boundary",
      },
      {
        name: "connection_store_link",
        ok: linkOk,
        detail: linkOk
          ? "SP-API connection is linked to the scoped commerce store"
          : "SP-API connection/store link is missing or crosses the organization boundary",
      },
      inspectFactBoundaries(database, config),
    ];
  } catch (error) {
    return identityFailureChecks(error instanceof Error ? error.message : String(error));
  } finally {
    database.close();
  }
}

function inspectFactBoundaries(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
): ShadowPreflightCheck {
  const marketplaceValues = acceptedMarketplaces(config.marketplace);
  const invalidRows: string[] = [];
  for (const table of FACT_BOUNDARY_TABLES) {
    const predicates = ["org_id <> ?"];
    const params: Array<number | string> = [config.dataSourceId, config.orgId];
    if (table.hasStore) {
      predicates.push("commerce_store_id <> ?");
      params.push(config.commerceStoreId);
    }
    if (table.hasMarketplace) {
      predicates.push(`marketplace NOT IN (${marketplaceValues.map(() => "?").join(", ")})`);
      params.push(...marketplaceValues);
    }
    const row = database.prepare(
      `SELECT COUNT(*) AS count FROM ${table.name}
       WHERE data_source_id = ? AND (${predicates.join(" OR ")})`,
    ).get(...params) as unknown as CountRow | undefined;
    const count = Number(row?.count ?? 0);
    if (count > 0) invalidRows.push(`${table.name}:${count}`);
  }
  return {
    name: "fact_boundary",
    ok: invalidRows.length === 0,
    detail: invalidRows.length === 0
      ? "scoped source facts stay within the organization, store, and marketplace boundary"
      : `cross-boundary fact rows found (${invalidRows.join(", ")})`,
  };
}

function acceptedMarketplaces(value: string): string[] {
  const normalized = value.trim();
  const canonical = canonicalMarketplace(normalized);
  const aliases = Object.entries(MARKETPLACE_ALIASES)
    .filter(([, region]) => region === canonical)
    .flatMap(([alias]) => [alias, alias.toUpperCase()]);
  return [...new Set([normalized, normalized.toUpperCase(), canonical, ...aliases])];
}

function identityFailureChecks(detail: string): ShadowPreflightCheck[] {
  return [
    "organization_boundary",
    "data_source_boundary",
    "commerce_store_boundary",
    "sp_api_connection",
    "connection_store_link",
    "fact_boundary",
  ].map((name) => ({ name, ok: false, detail }));
}

function describeSourceBoundary(
  source: DataSourceBoundaryRow | undefined,
  config: ShadowEvidenceCollectorConfig,
  sourceOrgOk: boolean,
  sourceTypeOk: boolean,
  sourceMarketplaceOk: boolean,
): string {
  if (!source) return "data source does not exist";
  if (!sourceOrgOk) return `data source organization does not match org ${config.orgId}`;
  if (!sourceTypeOk) return "data source is not amazon_sp_api";
  if (!sourceMarketplaceOk) return "data source marketplace does not match config";
  if (source.status === "disabled") return "data source is disabled";
  return "data source matches organization, type, marketplace, and enabled status";
}

function describeStoreBoundary(
  store: CommerceStoreBoundaryRow | undefined,
  config: ShadowEvidenceCollectorConfig,
  storeOrgOk: boolean,
  storeMarketplaceOk: boolean,
): string {
  if (!store) return "commerce store does not exist";
  if (!storeOrgOk) return `commerce store organization does not match org ${config.orgId}`;
  if (!storeMarketplaceOk) return "commerce store marketplace does not match config";
  if (store.platform !== "amazon") return "commerce store platform is not amazon";
  if (store.status !== "active") return "commerce store is not active";
  return "commerce store matches organization, marketplace, platform, and active status";
}

function marketplaceMatches(left: string, right: string): boolean {
  return canonicalMarketplace(left) === canonicalMarketplace(right);
}

function canonicalMarketplace(value: string): string {
  const normalized = value.trim().toLowerCase();
  return MARKETPLACE_ALIASES[normalized] ?? normalized.toUpperCase();
}
