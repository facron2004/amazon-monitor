import { createHash } from "node:crypto";
import type { SpApiInventoryFactInput, SpApiSalesTrafficFactInput } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { parseSpApiInventorySummaries } from "./sp-api-inventory-parser.js";
import { parseSpApiSalesTrafficReport } from "./sp-api-sales-traffic-parser.js";

export interface SpApiFixtureSyncInput {
  orgId: number;
  dataSourceId: number;
  syncRunId: number;
  commerceStoreId: number;
  marketplace: string;
  document: unknown;
  documentId: string;
  ensureActive?: () => void;
}

export interface SpApiFixtureSyncResult {
  totalRows: number;
  importedRows: number;
  createdRecords: number;
  updatedRecords: number;
  unmappedRows: number;
}

export function promoteSalesTrafficFixture(
  store: Store,
  input: SpApiFixtureSyncInput
): SpApiFixtureSyncResult {
  input.ensureActive?.();
  const parsed = parseSpApiSalesTrafficReport(input.document);
  const contentHash = hashDocument(input.document);
  const products = store.listProducts({
    orgId: input.orgId,
    storeId: input.commerceStoreId,
    marketplace: input.marketplace,
    limit: 1_000
  });
  const salesFacts: SpApiSalesTrafficFactInput[] = parsed.storeDaily.map((row) => ({
    orgId: input.orgId,
    dataSourceId: input.dataSourceId,
    syncRunId: input.syncRunId,
    commerceStoreId: input.commerceStoreId,
    marketplace: input.marketplace,
    businessDate: row.businessDate,
    scope: "store_daily" as const,
    salesAmount: row.salesAmount,
    orders: row.orders,
    unitsSold: row.unitsSold,
    sessions: row.sessions,
    pageViews: row.pageViews,
    buyBoxPercentage: row.buyBoxPercentage,
    conversionRate: row.conversionRate,
    currency: row.currency,
    sourceDocumentId: input.documentId,
    contentHash
  }));
  let unmappedRows = 0;
  for (const row of parsed.asinDaily) {
    input.ensureActive?.();
    const candidates = products.filter((product) => product.asin === row.sourceAsin);
    if (candidates.length !== 1) {
      unmappedRows++;
      store.upsertDataSourceMappingIssue({
        orgId: input.orgId,
        dataSourceId: input.dataSourceId,
        commerceStoreId: input.commerceStoreId,
        marketplace: input.marketplace,
        domain: "sales_traffic",
        issueType: candidates.length === 0 ? "unknown_asin" : "ambiguous_asin",
        sourceAsin: row.sourceAsin,
        candidateProductIds: candidates.map((candidate) => candidate.id),
        runId: input.syncRunId
      });
      continue;
    }
    const product = candidates[0];
    salesFacts.push({
      orgId: input.orgId,
      dataSourceId: input.dataSourceId,
      syncRunId: input.syncRunId,
      commerceStoreId: input.commerceStoreId,
      marketplace: input.marketplace,
      businessDate: row.businessDate,
      scope: "sku_daily",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: row.sourceAsin,
      salesAmount: row.salesAmount,
      orders: row.orders,
      unitsSold: row.unitsSold,
      sessions: row.sessions,
      pageViews: row.pageViews,
      buyBoxPercentage: row.buyBoxPercentage,
      conversionRate: row.conversionRate,
      currency: row.currency,
      sourceDocumentId: input.documentId,
      contentHash
    });
  }
  const promotion = store.promoteSpApiSalesTrafficFacts(salesFacts, { ensureActive: input.ensureActive });
  return {
    totalRows: parsed.storeDaily.length + parsed.asinDaily.length,
    importedRows: promotion.importedRows,
    createdRecords: promotion.createdRecords,
    updatedRecords: promotion.updatedRecords,
    unmappedRows
  };
}

export function promoteInventoryFixture(
  store: Store,
  input: SpApiFixtureSyncInput
): SpApiFixtureSyncResult {
  input.ensureActive?.();
  const parsed = parseSpApiInventorySummaries(input.document);
  const contentHash = hashDocument(input.document);
  const inventoryFacts: SpApiInventoryFactInput[] = parsed.map((row) => {
    input.ensureActive?.();
    const product = store.getProductBySku(input.orgId, input.marketplace, row.sellerSku);
    const productMatchesStore = product?.storeId === input.commerceStoreId;
    const asinMatches = !product || !row.sourceAsin || product.asin === row.sourceAsin;
    if (!productMatchesStore || !asinMatches) {
      store.upsertDataSourceMappingIssue({
        orgId: input.orgId,
        dataSourceId: input.dataSourceId,
        commerceStoreId: input.commerceStoreId,
        marketplace: input.marketplace,
        domain: "fba_inventory",
        issueType: !productMatchesStore ? "unknown_sku" : "asin_conflict",
        sellerSku: row.sellerSku,
        sourceAsin: row.sourceAsin,
        candidateProductIds: product ? [product.id] : [],
        runId: input.syncRunId
      });
    }
    return {
      orgId: input.orgId,
      dataSourceId: input.dataSourceId,
      syncRunId: input.syncRunId,
      commerceStoreId: input.commerceStoreId,
      marketplace: input.marketplace,
      sellerSku: row.sellerSku,
      productId: productMatchesStore && asinMatches ? product?.id ?? null : null,
      sourceAsin: row.sourceAsin,
      fulfillableQuantity: row.fulfillableQuantity,
      reservedQuantity: row.reservedQuantity,
      inboundWorkingQuantity: row.inboundWorkingQuantity,
      inboundShippedQuantity: row.inboundShippedQuantity,
      inboundReceivingQuantity: row.inboundReceivingQuantity,
      inboundQuantity: row.inboundQuantity,
      unfulfillableQuantity: row.unfulfillableQuantity,
      totalQuantity: row.totalQuantity,
      sourceTime: row.sourceTime,
      sourceDocumentId: input.documentId,
      contentHash
    };
  });
  const promotion = store.promoteSpApiInventoryFacts(inventoryFacts, { ensureActive: input.ensureActive });
  const unmappedRows = inventoryFacts.filter((fact) => fact.productId === null).length;
  return {
    totalRows: parsed.length,
    importedRows: promotion.importedRows,
    createdRecords: promotion.createdRecords,
    updatedRecords: promotion.updatedRecords,
    unmappedRows
  };
}

function hashDocument(document: unknown): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}
