import type { ShadowEvidenceValidation } from "./sp-api-shadow-evidence-validation.js";

export interface ShadowEvidenceExternalReference {
  reportId: string;
  downloadedAt: string;
  sha256: string;
}

export interface ShadowEvidenceCollectorConfig {
  databasePath: string;
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  currency: string;
  businessTimezone: string;
  evidenceBundleId: string;
  organizationEvidenceId: string;
  commerceStoreEvidenceId: string;
  sourceEvidenceId: string;
  windowStart: string;
  windowEnd: string;
  externalReferences: Record<string, ShadowEvidenceExternalReference>;
  observedAtByDate: Record<string, string>;
}

export interface ShadowEvidenceCollectionResult {
  bundle: Record<string, unknown>;
  validation: ShadowEvidenceValidation;
}

export interface SalesRow {
  id: number;
  scope: "store_daily" | "sku_daily";
  sales_amount: number | null;
  orders: number | null;
  units_sold: number | null;
  currency: string;
  data_source_id: number;
  sync_run_id: number;
  product_id: number | null;
  synced_at: string;
}

export interface RunRow {
  id: number;
  created_records: number;
  updated_records: number;
  status: string;
  error_code: string | null;
  checkpoint_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface LatestRunAttempt {
  status: string;
  error_code: string | null;
}

export interface FbaSummary {
  sourceRunId: number | null;
  snapshotRows: number;
  latestRows: number;
  asOfRows: number;
  freshnessMinutes: number;
}

export interface FbaFreshnessRow {
  source_time: string | null;
  synced_at: string | null;
  missing_source_time: number | null;
  invalid_source_time: number | null;
}

export interface SalesSummary {
  hasFacts: boolean;
  syncRunId: number | null;
  storeDailyAmountMinor: number;
  skuAmountMinor: number;
  unmappedAmountMinor: number;
  orders: number;
  units: number;
  factRows: number;
  replayCreatedRecords: number;
  replayUpdatedRecords: number;
}

export type ShadowEvidenceDomain = "sales_traffic" | "fba_inventory";
