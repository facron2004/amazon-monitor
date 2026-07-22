import type {
  DataSourceConfig,
  DataSourceCostImportResult,
  DataSourceImportError,
  DataSourceImportPayload,
  ProductProfitSetting,
  UpsertProductProfitSettingInput
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { finalizeDataSourceImport } from "./data-source-csv-import.js";
import { parseDataSourceImportRows } from "./data-source-tabular-import.js";

const REQUIRED_HEADERS = ["sku"] as const;
const COST_FIELDS = [
  "purchaseCost",
  "inboundFreight",
  "fbaFee",
  "referralFeeRate",
  "storageFee",
  "returnLossRate",
  "targetMarginRate",
  "minimumMarginRate",
  "dealFee"
] as const;
const RATE_FIELDS = ["referralFeeRate", "returnLossRate", "targetMarginRate", "minimumMarginRate"] as const;

type CostField = (typeof COST_FIELDS)[number];
type CostValues = Partial<Record<CostField, number | null>>;

interface ParsedCostRow {
  row: number;
  productId: number;
  values: CostValues;
}

export async function importDataSourceCosts(
  store: Store,
  source: DataSourceConfig,
  input: DataSourceImportPayload
): Promise<DataSourceCostImportResult> {
  const requiredHeaders = source.marketplace ? REQUIRED_HEADERS : [...REQUIRED_HEADERS, "marketplace"];
  const rows = await parseDataSourceImportRows(input, requiredHeaders);
  if (!COST_FIELDS.some((field) => Object.hasOwn(rows[0].values, field))) {
    throw invalidInput(`Cost import requires at least one cost header: ${COST_FIELDS.join(", ")}`);
  }

  const validRows: ParsedCostRow[] = [];
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
      const existing = store.getProfitSetting(row.productId);
      store.upsertProfitSetting({
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
): ParsedCostRow | DataSourceImportError {
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

  const parsedValues: CostValues = {};
  for (const field of COST_FIELDS) {
    if (!Object.hasOwn(values, field)) continue;
    const parsed = parseCostValue(field, values[field]);
    if (typeof parsed === "string") return { row, message: parsed };
    parsedValues[field] = parsed;
  }
  return { row, productId: product.id, values: parsedValues };
}

function parseCostValue(field: CostField, rawValue: string | undefined): number | null | string {
  const raw = rawValue?.trim();
  if (!raw) return null;
  const isPercent = raw.endsWith("%");
  const numberValue = Number(isPercent ? raw.slice(0, -1).trim() : raw);
  if (!Number.isFinite(numberValue) || numberValue < 0) return `${field} must be a non-negative number`;
  const isRate = RATE_FIELDS.includes(field as (typeof RATE_FIELDS)[number]);
  if (isPercent && !isRate) return `${field} does not accept percentage values`;
  const value = isPercent ? numberValue / 100 : numberValue;
  if (isRate && value > 1) return `${field} must be between 0 and 1 or use a percentage`;
  return value;
}

function settingValues(setting: ProductProfitSetting): Partial<UpsertProductProfitSettingInput> {
  return {
    purchaseCost: setting.purchaseCost,
    inboundFreight: setting.inboundFreight,
    fbaFee: setting.fbaFee,
    referralFeeRate: setting.referralFeeRate,
    storageFee: setting.storageFee,
    returnLossRate: setting.returnLossRate,
    targetMarginRate: setting.targetMarginRate,
    minimumMarginRate: setting.minimumMarginRate,
    dealFee: setting.dealFee
  };
}

function invalidInput(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
