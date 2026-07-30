export interface ParsedFbaInventoryRow {
  sellerSku: string;
  sourceAsin: string | null;
  fulfillableQuantity: number | null;
  reservedQuantity: number | null;
  inboundWorkingQuantity: number | null;
  inboundShippedQuantity: number | null;
  inboundReceivingQuantity: number | null;
  inboundQuantity: number | null;
  unfulfillableQuantity: number | null;
  totalQuantity: number | null;
  sourceTime: string | null;
}

export function parseSpApiInventorySummaries(document: unknown): ParsedFbaInventoryRow[] {
  const root = record(document, "FBA Inventory response");
  const payload = root.payload === undefined ? root : record(root.payload, "FBA Inventory payload");
  const summaries = array(payload.inventorySummaries, "inventorySummaries");
  return summaries.map((item) => parseSummary(record(item, "inventory summary")));
}

function parseSummary(summary: Record<string, unknown>): ParsedFbaInventoryRow {
  const details = summary.inventoryDetails === undefined ? {} : record(summary.inventoryDetails, "inventoryDetails");
  const inboundWorkingQuantity = optionalQuantity(details.inboundWorkingQuantity, "inboundWorkingQuantity");
  const inboundShippedQuantity = optionalQuantity(details.inboundShippedQuantity, "inboundShippedQuantity");
  const inboundReceivingQuantity = optionalQuantity(details.inboundReceivingQuantity, "inboundReceivingQuantity");
  const inboundQuantity = optionalQuantity(summary.inboundQuantity, "inboundQuantity")
    ?? sumKnown([inboundWorkingQuantity, inboundShippedQuantity, inboundReceivingQuantity]);
  return {
    sellerSku: requiredText(summary.sellerSku, "sellerSku"),
    sourceAsin: optionalText(summary.asin),
    fulfillableQuantity: optionalQuantity(details.fulfillableQuantity ?? summary.fulfillableQuantity, "fulfillableQuantity"),
    reservedQuantity: optionalQuantity(details.reservedQuantity ?? summary.reservedQuantity, "reservedQuantity"),
    inboundWorkingQuantity,
    inboundShippedQuantity,
    inboundReceivingQuantity,
    inboundQuantity,
    unfulfillableQuantity: optionalQuantity(details.unfulfillableQuantity ?? summary.unfulfillableQuantity, "unfulfillableQuantity"),
    totalQuantity: optionalQuantity(summary.totalQuantity, "totalQuantity"),
    sourceTime: optionalText(summary.lastUpdatedTime)
  };
}

function optionalQuantity(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
