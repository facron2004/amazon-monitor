import type { BestsellerRankSnapshot } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import type { CellValue } from "./excel-workbook.js";

export function buildBrandTop10ChangeRows(store: Store, date: string, currentSnapshots: BestsellerRankSnapshot[]): CellValue[][] {
  const rows: CellValue[][] = [];
  const categoryIds = Array.from(new Set(currentSnapshots.map((item) => item.categoryId)));
  for (const categoryId of categoryIds) {
    const today = currentSnapshots.filter((item) => item.categoryId === categoryId);
    const previous = store.getPreviousCategorySnapshots(categoryId, date);
    rows.push(...buildBrandTop10RowsForCategory(date, today, previous));
  }
  return rows.sort((a, b) => {
    const categoryCompare = String(a[1] ?? "").localeCompare(String(b[1] ?? ""));
    if (categoryCompare !== 0) return categoryCompare;
    return Number(b[4] ?? 0) - Number(a[4] ?? 0) || String(a[3] ?? "").localeCompare(String(b[3] ?? ""));
  });
}

function buildBrandTop10RowsForCategory(date: string, today: BestsellerRankSnapshot[], previous: BestsellerRankSnapshot[]): CellValue[][] {
  const todayByBrand = groupTop10ByBrand(today);
  const previousByBrand = groupTop10ByBrand(previous);
  const brands = Array.from(new Set([...todayByBrand.keys(), ...previousByBrand.keys()]));
  const categoryName = today[0]?.categoryName ?? previous[0]?.categoryName ?? "";
  const marketplace = today[0]?.marketplace ?? previous[0]?.marketplace ?? "";

  return brands.map((brand) => {
    const currentTop10 = (todayByBrand.get(brand) ?? []).sort((a, b) => a.rank - b.rank);
    const previousTop10 = (previousByBrand.get(brand) ?? []).sort((a, b) => a.rank - b.rank);
    const currentByAsin = new Map(currentTop10.map((item) => [item.asin, item]));
    const previousByAsin = new Map(previousTop10.map((item) => [item.asin, item]));
    const newTop10 = currentTop10.filter((item) => !previousByAsin.has(item.asin));
    const droppedTop10 = previousTop10.filter((item) => !currentByAsin.has(item.asin));
    const rankMoves = currentTop10
      .map((item) => {
        const prev = previousByAsin.get(item.asin);
        return prev && prev.rank !== item.rank ? `${item.asin}: #${prev.rank}->#${item.rank}` : null;
      })
      .filter((item): item is string => Boolean(item));

    return [
      date,
      categoryName,
      marketplace,
      brand,
      currentTop10.length,
      previousTop10.length,
      currentTop10.length - previousTop10.length,
      formatRankedAsins(currentTop10),
      formatRankedAsins(newTop10),
      formatRankedAsins(droppedTop10),
      rankMoves.join("; ")
    ];
  });
}

function groupTop10ByBrand(items: BestsellerRankSnapshot[]): Map<string, BestsellerRankSnapshot[]> {
  const groups = new Map<string, BestsellerRankSnapshot[]>();
  for (const item of items) {
    if (item.rank > 10) {
      continue;
    }
    const brand = item.brand?.trim() || "Unknown";
    const group = groups.get(brand);
    if (group) {
      group.push(item);
    } else {
      groups.set(brand, [item]);
    }
  }
  return groups;
}

function formatRankedAsins(items: BestsellerRankSnapshot[]): string {
  return items.map((item) => `${item.asin} (#${item.rank})`).join(", ");
}
