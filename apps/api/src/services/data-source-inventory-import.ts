import type {
  DataSourceConfig,
  DataSourceImportError,
  DataSourceImportPayload,
  DataSourceInventoryImportResult,
  InventoryReplenishmentSetting,
  UpsertInventoryReplenishmentSettingInput
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { emptyToNull, finalizeDataSourceImport, isIsoDate } from "./data-source-csv-import.js";
import { parseDataSourceImportRows } from "./data-source-tabular-import.js";

const REQUIRED_HEADERS = ["sku"] as const;
const NUMBER_FIELDS = [
  "leadTimeDays",
  "productionLeadTimeDays",
  "inboundLeadTimeDays",
  "safetyStockDays",
  "targetStockDays",
  "minOrderQuantity",
  "packSize",
  "reorderPointUnits",
  "inTransitUnits",
  "localWarehouseUnits"
] as const;
const INTEGER_FIELDS = [
  "minOrderQuantity",
  "packSize",
  "reorderPointUnits",
  "inTransitUnits",
  "localWarehouseUnits"
] as const;
const TEXT_FIELDS = ["supplierName", "expectedArrivalDate"] as const;
const IMPORT_FIELDS = [...NUMBER_FIELDS, ...TEXT_FIELDS] as const;

type NumberField = (typeof NUMBER_FIELDS)[number];
type InventoryValues = Omit<UpsertInventoryReplenishmentSettingInput, "productId">;

interface ParsedInventoryRow {
  row: number;
  productId: number;
  values: InventoryValues;
}

export async function importDataSourceInventory(
  store: Store,
  source: DataSourceConfig,
  input: DataSourceImportPayload
): Promise<DataSourceInventoryImportResult> {
  const requiredHeaders = source.marketplace ? REQUIRED_HEADERS : [...REQUIRED_HEADERS, "marketplace"];
  const rows = await parseDataSourceImportRows(input, requiredHeaders);
  if (!IMPORT_FIELDS.some((field) => Object.hasOwn(rows[0].values, field))) {
    throw invalidInput(`Inventory import requires at least one planning header: ${IMPORT_FIELDS.join(", ")}`);
  }

  const validRows: ParsedInventoryRow[] = [];
  const errors: DataSourceImportError[] = [];
  for (const row of rows) {
    const parsed = validateRow(store, source, row.row, row.values);
    if ("message" in parsed) errors.push(parsed);
    else validRows.push(parsed);
  }

  let createdSettings = 0;
  let updatedSettings = 0;
  const syncedAt = new Date().toISOString();
  store.runInTransaction(() => {
    for (const row of validRows) {
      const existing = store.getInventorySetting(row.productId);
      store.upsertInventorySetting({
        productId: row.productId,
        ...(existing ? settingValues(existing) : {}),
        ...row.values,
        dataSource: source.name,
        lastSyncedAt: syncedAt,
        syncStatus: "success",
        syncError: null
      });
      if (existing) updatedSettings += 1;
      else createdSettings += 1;
    }
  });

  return {
    source: finalizeDataSourceImport(store, source, syncedAt, validRows.length, errors),
    totalRows: rows.length,
    importedRows: validRows.length,
    failedRows: errors.length,
    createdSettings,
    updatedSettings,
    errors: errors.slice(0, 20)
  };
}

function validateRow(
  store: Store,
  source: DataSourceConfig,
  row: number,
  values: Record<string, string>
): ParsedInventoryRow | DataSourceImportError {
  const sku = values.sku?.trim();
  const csvMarketplace = values.marketplace?.trim();
  const configuredMarketplace = source.marketplace?.trim();
  if (!sku) return { row, message: "Missing values: sku" };
  if (configuredMarketplace && csvMarketplace && configuredMarketplace !== csvMarketplace) {
    return { row, message: `marketplace must match configured source ${configuredMarketplace}` };
  }
  const marketplace = configuredMarketplace || csvMarketplace;
  if (!marketplace) return { row, message: "Missing values: marketplace" };
  const product = store.getProductBySku(source.orgId, marketplace, sku);
  if (!product) return { row, message: `product not found for sku ${sku} in ${marketplace}` };

  const parsedValues: InventoryValues = {};
  for (const field of NUMBER_FIELDS) {
    if (!Object.hasOwn(values, field)) continue;
    const parsed = parseNumber(field, values[field]);
    if (typeof parsed === "string") return { row, message: parsed };
    parsedValues[field] = parsed;
  }
  if (Object.hasOwn(values, "supplierName")) parsedValues.supplierName = emptyToNull(values.supplierName);
  if (Object.hasOwn(values, "expectedArrivalDate")) {
    const date = emptyToNull(values.expectedArrivalDate);
    if (date && !isIsoDate(date)) return { row, message: "expectedArrivalDate must use YYYY-MM-DD" };
    parsedValues.expectedArrivalDate = date;
  }
  return { row, productId: product.id, values: parsedValues };
}

function parseNumber(field: NumberField, rawValue: string | undefined): number | null | string {
  const raw = rawValue?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return `${field} must be a non-negative number`;
  if (INTEGER_FIELDS.includes(field as (typeof INTEGER_FIELDS)[number]) && !Number.isInteger(value)) {
    return `${field} must be a non-negative integer`;
  }
  if (field === "packSize" && value < 1) return "packSize must be at least 1";
  if (field === "targetStockDays" && value < 1) return "targetStockDays must be at least 1";
  if (field.endsWith("Days") && value > 730) return `${field} must not exceed 730`;
  return value;
}

function settingValues(setting: InventoryReplenishmentSetting): InventoryValues {
  return {
    leadTimeDays: setting.leadTimeDays,
    productionLeadTimeDays: setting.productionLeadTimeDays,
    inboundLeadTimeDays: setting.inboundLeadTimeDays,
    safetyStockDays: setting.safetyStockDays,
    targetStockDays: setting.targetStockDays,
    minOrderQuantity: setting.minOrderQuantity,
    packSize: setting.packSize,
    supplierName: setting.supplierName,
    reorderPointUnits: setting.reorderPointUnits,
    inTransitUnits: setting.inTransitUnits,
    localWarehouseUnits: setting.localWarehouseUnits,
    expectedArrivalDate: setting.expectedArrivalDate
  };
}

function invalidInput(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
