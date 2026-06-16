import type { ProductActivityCalendar, ProductRanking } from "@amazon-monitor/shared";
import { selectSpecificBestsellerRank } from "@amazon-monitor/shared";

export function bestDayPrice(day: ProductActivityCalendar["days"][number]): number | null {
  return (
    day.priceHistory?.currentPrice ??
    day.categoryRanks.find((item) => item.price !== null)?.price ??
    day.keywordRanks.find((item) => item.price !== null)?.price ??
    null
  );
}

export function specificBestsellerRank(ranks: ProductRanking[]): ProductRanking | null {
  return selectSpecificBestsellerRank(ranks);
}
