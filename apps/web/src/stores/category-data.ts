import type {
  BsrRankChange,
  BsrSnapshotQuality,
  BsrSourceType,
  CategorySignalLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { categoryApi } from "../api-categories";
import type { CategoryDetail } from "../api-types";

const CATEGORY_SOURCE_TYPE: BsrSourceType = "category_bestseller";

export interface CategoryDetailBundle {
  categoryDetail: CategoryDetail | null;
  categorySignals: CategorySignalLog[];
  bsrQuality: BsrSnapshotQuality[];
  bsrRankChanges: BsrRankChange[];
  actionInsights: CompetitorActionInsight[];
  activityEvents: CompetitorActivityEvent[];
  priceHistory: ProductPriceHistory[];
}

export async function resolveCategoryDataDate(categoryId: number | null, date: string): Promise<string> {
  const currentOkRows = await categoryApi.bsrQuality({
    date,
    sourceType: CATEGORY_SOURCE_TYPE,
    sourceId: categoryId,
    qualityStatus: "ok",
    limit: 1
  });
  if (currentOkRows.length > 0) {
    return date;
  }

  const latestOkRows = await categoryApi.bsrQuality({
    sourceType: CATEGORY_SOURCE_TYPE,
    sourceId: categoryId,
    qualityStatus: "ok",
    limit: 1
  });
  return latestOkRows[0]?.snapshotDate ?? date;
}

export async function loadBsrQualityForDates(sourceId: number | null, date: string, dataDate: string): Promise<BsrSnapshotQuality[]> {
  const currentRows = await categoryApi.bsrQuality({
    date,
    sourceType: CATEGORY_SOURCE_TYPE,
    sourceId
  });
  if (dataDate === date) {
    return currentRows;
  }

  const fallbackRows = await categoryApi.bsrQuality({
    date: dataDate,
    sourceType: CATEGORY_SOURCE_TYPE,
    sourceId
  });
  return mergeBsrQualityRows([...currentRows, ...fallbackRows]);
}

export async function loadCategoryDetailBundle(categoryId: number | null, date: string, dataDate: string): Promise<CategoryDetailBundle> {
  if (!categoryId) {
    const [categorySignals, bsrQuality, bsrRankChanges, actionInsights, activityEvents, priceHistory] = await Promise.all([
      categoryApi.categorySignals(dataDate),
      loadBsrQualityForDates(null, date, dataDate),
      categoryApi.bsrChanges({ date: dataDate, sourceType: CATEGORY_SOURCE_TYPE }),
      categoryApi.actionInsights({ date: dataDate, sourceType: CATEGORY_SOURCE_TYPE }),
      categoryApi.activityEvents({ date: dataDate }),
      categoryApi.productPriceHistory({ date: dataDate })
    ]);

    return {
      categoryDetail: null,
      categorySignals,
      bsrQuality,
      bsrRankChanges,
      actionInsights,
      activityEvents,
      priceHistory
    };
  }

  const [categoryDetail, categorySignals, bsrQuality, bsrRankChanges, actionInsights, activityEvents, priceHistory] = await Promise.all([
    categoryApi.categoryDetail(categoryId, dataDate),
    categoryApi.categorySignals(dataDate, categoryId),
    loadBsrQualityForDates(categoryId, date, dataDate),
    categoryApi.bsrChanges({ date: dataDate, sourceType: CATEGORY_SOURCE_TYPE, sourceId: categoryId }),
    categoryApi.actionInsights({ date: dataDate, sourceType: CATEGORY_SOURCE_TYPE, sourceId: categoryId }),
    categoryApi.activityEvents({ date: dataDate, categoryId }),
    categoryApi.productPriceHistory({ date: dataDate, categoryId })
  ]);

  return {
    categoryDetail,
    categorySignals,
    bsrQuality,
    bsrRankChanges,
    actionInsights,
    activityEvents,
    priceHistory
  };
}

function mergeBsrQualityRows(rows: BsrSnapshotQuality[]): BsrSnapshotQuality[] {
  const unique = new Map<string, BsrSnapshotQuality>();
  for (const row of rows) {
    unique.set(`${row.snapshotDate}|${row.sourceType}|${row.sourceId ?? ""}|${row.category}`, row);
  }
  return Array.from(unique.values()).sort((a, b) => {
    const dateCompare = b.snapshotDate.localeCompare(a.snapshotDate);
    if (dateCompare !== 0) return dateCompare;
    const priority: Record<BsrSnapshotQuality["qualityStatus"], number> = { partial: 0, empty: 1, ok: 2 };
    return priority[a.qualityStatus] - priority[b.qualityStatus];
  });
}
