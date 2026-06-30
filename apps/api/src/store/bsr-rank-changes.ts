import type { BsrRankChange, BsrRankHistory } from "@amazon-monitor/shared";

export function groupBsrHistoryByScope(items: BsrRankHistory[]): Map<string, BsrRankHistory[]> {
  const groups = new Map<string, BsrRankHistory[]>();
  for (const item of items) {
    const key = [item.sourceType, item.sourceId ?? "", item.category].join("|");
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

export function buildBsrRankChanges(date: string, previousDate: string | null, today: BsrRankHistory[], yesterday: BsrRankHistory[], includeUnchanged = true): BsrRankChange[] {
  const todayByKey = new Map(today.map((item) => [bsrChangeKey(item), item]));
  const yesterdayByKey = new Map(yesterday.map((item) => [bsrChangeKey(item), item]));
  const keys = Array.from(new Set([...todayByKey.keys(), ...yesterdayByKey.keys()]));

  // Build changes with an early-skip for "unchanged" entries when the caller
  // doesn't want them. Avoids allocating the objects and the later filter
  // pass over the full result array.
  const changes: BsrRankChange[] = [];
  for (const key of keys) {
    const current = todayByKey.get(key);
    const previous = yesterdayByKey.get(key);
    const reference = current ?? previous!;
    const currentRank = current?.rank ?? null;
    const previousRank = previous?.rank ?? null;
    const rankChange = currentRank !== null && previousRank !== null ? previousRank - currentRank : null;
    const changeType: BsrRankChange["changeType"] =
      current && !previous
        ? "new_entry"
        : !current && previous
          ? "dropped"
          : rankChange !== null && rankChange > 0
            ? "rank_up"
            : rankChange !== null && rankChange < 0
              ? "rank_down"
              : "unchanged";

    if (!includeUnchanged && changeType === "unchanged") {
      continue;
    }

    changes.push({
      snapshotDate: date,
      previousDate,
      sourceType: reference.sourceType,
      sourceId: reference.sourceId,
      sourceName: reference.sourceName,
      marketplace: reference.marketplace,
      category: reference.category,
      asin: reference.asin,
      title: reference.title,
      brand: reference.brand,
      currentRank,
      previousRank,
      rankChange,
      changeType,
      productUrl: current?.productUrl ?? previous?.productUrl ?? null,
      currentPrice: current?.currentPrice ?? null
    });
  }
  return changes.sort(compareBsrRankChanges);
}

export function compareBsrRankChanges(a: BsrRankChange, b: BsrRankChange): number {
  const severity = (value: BsrRankChange["changeType"]) =>
    value === "new_entry" ? 5 : value === "dropped" ? 4 : value === "rank_up" ? 3 : value === "rank_down" ? 2 : 1;
  return (
    severity(b.changeType) - severity(a.changeType) ||
    (a.currentRank ?? a.previousRank ?? 999999) - (b.currentRank ?? b.previousRank ?? 999999) ||
    a.asin.localeCompare(b.asin)
  );
}

function bsrChangeKey(item: BsrRankHistory): string {
  return [item.sourceType, item.sourceId ?? "", item.marketplace, item.category, item.asin].join("|");
}
