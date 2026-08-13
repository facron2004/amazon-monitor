import type { DataSourceConfig, SpApiSyncDomain, SpApiSyncMode } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { isSpApiConnectorEnabled } from "./sp-api-feature-flag.js";

export type ScheduledSpApiSyncKind = "sales_daily" | "fba_incremental" | "fba_full";

/** Enqueue idempotent private-app sync runs. It never calls Amazon directly. */
export function enqueueScheduledSpApiSyncs(
  store: Store,
  kind: ScheduledSpApiSyncKind,
  now = new Date()
): number {
  if (!isSpApiConnectorEnabled()) return 0;

  let count = 0;
  for (const source of store.listDataSources({ sourceType: "amazon_sp_api", limit: 1_000 })) {
    if (source.status === "disabled" || source.status === "not_connected") continue;
    const connection = store.getSpApiConnection(source.id, source.orgId);
    if (!connection?.credentialsConfigured) continue;
    for (const commerceStoreId of connection.linkedStoreIds) {
      const commerceStore = store.getCommerceStore(commerceStoreId);
      if (!commerceStore || commerceStore.orgId !== source.orgId) continue;
      const marketplace = marketplaceCode(commerceStore.marketplace);
      if (!marketplace) continue;
      const details = scheduledRunDetails(source, marketplace, connection.credentialVersion, kind, now);
      const run = store.createDataSourceSyncRun(details);
      store.pushJob("data_source_sync", run.id, details.requestedToDate ?? now.toISOString().slice(0, 10), source.orgId);
      count += 1;
    }
    store.updateDataSource(source.id, { syncStatus: "pending", syncError: null });
  }
  return count;
}

function scheduledRunDetails(
  source: DataSourceConfig,
  marketplace: "US" | "UK" | "DE" | "JP",
  credentialVersion: number,
  kind: ScheduledSpApiSyncKind,
  now: Date
) {
  const domain: SpApiSyncDomain = kind === "sales_daily" ? "sales_traffic" : "fba_inventory";
  const mode: SpApiSyncMode = kind === "fba_full" ? "full" : "incremental";
  const salesDate = domain === "sales_traffic" ? marketplaceBusinessDateOffset(marketplace, -1, now) : null;
  const window = kind === "fba_incremental" ? halfHourWindow(now) : salesDate ?? marketplaceBusinessDateOffset(marketplace, 0, now);
  return {
    orgId: source.orgId,
    dataSourceId: source.id,
    operation: kind === "sales_daily"
      ? "sp_api_sales_traffic_daily_sync" as const
      : kind === "fba_full"
        ? "sp_api_fba_inventory_full_reconcile" as const
        : "sp_api_fba_inventory_incremental_sync" as const,
    domain,
    trigger: "scheduled" as const,
    mode,
    credentialVersion,
    marketplaces: [marketplace],
    requestedFromDate: salesDate,
    requestedToDate: salesDate,
    idempotencyKey: `${source.id}:${domain}:${marketplace}:${window}:${mode}:scheduled`
  };
}

function marketplaceCode(marketplace: string): "US" | "UK" | "DE" | "JP" | null {
  const normalized = marketplace.trim().toLowerCase().replace(/^www\./, "");
  if (normalized === "us" || normalized === "amazon.com") return "US";
  if (normalized === "uk" || normalized === "gb" || normalized === "amazon.co.uk") return "UK";
  if (normalized === "de" || normalized === "amazon.de") return "DE";
  if (normalized === "jp" || normalized === "amazon.co.jp") return "JP";
  return null;
}

function halfHourWindow(now: Date): string {
  const minutes = Math.floor(now.getUTCMinutes() / 30) * 30;
  return `${now.toISOString().slice(0, 13)}:${String(minutes).padStart(2, "0")}`;
}

function marketplaceBusinessDateOffset(
  marketplace: "US" | "UK" | "DE" | "JP",
  offsetDays: number,
  now: Date
): string {
  const timeZone = marketplace === "US"
    ? "America/Los_Angeles"
    : marketplace === "UK"
      ? "Europe/London"
      : marketplace === "DE"
        ? "Europe/Berlin"
        : "Asia/Tokyo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}
