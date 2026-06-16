import type {
  AlertLog,
  AnalyzeDailyChangesInput,
  ChangeType,
  DailyAnalysisResult,
  DailyChange,
  SerpSnapshot
} from "./types.js";
import { formatMoney, formatPercent, roundCurrency, roundRate } from "./report-formatters.js";

export function analyzeDailyChanges(input: AnalyzeDailyChangesInput): DailyAnalysisResult {
  const todayByKey = new Map(input.today.map((item) => [snapshotKey(item), item]));
  const yesterdayByKey = new Map(input.yesterday.map((item) => [snapshotKey(item), item]));
  const analysisDate = input.today[0]?.snapshotDate ?? input.yesterday[0]?.snapshotDate ?? "";
  const changes: DailyChange[] = [];
  const alerts: AlertLog[] = [];

  const pushChange = (
    changeType: ChangeType,
    today: SerpSnapshot | null,
    yesterday: SerpSnapshot | null,
    alert?: Omit<AlertLog, "alertDate" | "keyword" | "asin" | "title" | "brand" | "status">
  ) => {
    const source = today ?? yesterday;
    if (!source) {
      return;
    }
    const priceChange =
      today?.currentPrice !== null &&
      today?.currentPrice !== undefined &&
      yesterday?.currentPrice !== null &&
      yesterday?.currentPrice !== undefined
        ? roundCurrency(today.currentPrice - yesterday.currentPrice)
        : null;
    const priceChangeRate =
      priceChange !== null && yesterday?.currentPrice ? roundRate(priceChange / yesterday.currentPrice) : null;
    const rankChange =
      today?.absoluteRank !== undefined && yesterday?.absoluteRank !== undefined
        ? yesterday.absoluteRank - today.absoluteRank
        : null;

    changes.push({
      asin: source.asin,
      keyword: source.keyword,
      marketplace: source.marketplace,
      snapshotDate: today?.snapshotDate ?? analysisDate,
      yesterdayRank: yesterday?.absoluteRank ?? null,
      todayRank: today?.absoluteRank ?? null,
      rankChange,
      yesterdayPrice: yesterday?.currentPrice ?? null,
      todayPrice: today?.currentPrice ?? null,
      priceChange,
      priceChangeRate,
      yesterdaySponsored: yesterday?.isSponsored ?? null,
      todaySponsored: today?.isSponsored ?? null,
      changeType,
      title: source.title,
      brand: source.brand
    });

    if (alert) {
      alerts.push({
        alertDate: today?.snapshotDate ?? analysisDate,
        keyword: source.keyword,
        asin: source.asin,
        title: source.title,
        brand: source.brand,
        status: "pending",
        ...alert
      });
    }
  };

  for (const today of input.today) {
    const yesterday = yesterdayByKey.get(snapshotKey(today)) ?? null;

    if (!yesterday) {
      pushChange("new_competitor", today, null, {
        alertType: "new_asin_entered",
        alertLevel: today.absoluteRank <= 20 ? "high" : "medium",
        alertContent: `${today.asin} 首次进入 ${today.keyword} 搜索结果，当前第 ${today.absoluteRank} 名。`,
        oldValue: null,
        newValue: String(today.absoluteRank)
      });
      continue;
    }

    if (today.currentPrice !== null && yesterday.currentPrice !== null) {
      const priceChange = roundCurrency(today.currentPrice - yesterday.currentPrice);
      const priceChangeRate = roundRate(priceChange / yesterday.currentPrice);
      if (priceChangeRate <= -0.05) {
        pushChange("price_drop", today, yesterday, {
          alertType: "significant_price_drop",
          alertLevel: "high",
          alertContent: `${today.asin} 价格从 ${formatMoney(yesterday.currentPrice, today.currency)} 降至 ${formatMoney(
            today.currentPrice,
            today.currency
          )}，降幅 ${formatPercent(Math.abs(priceChangeRate))}。`,
          oldValue: String(yesterday.currentPrice),
          newValue: String(today.currentPrice)
        });
      }
      if (priceChangeRate >= 0.1) {
        pushChange("price_rise", today, yesterday, {
          alertType: "significant_price_rise",
          alertLevel: "medium",
          alertContent: `${today.asin} 价格从 ${formatMoney(yesterday.currentPrice, today.currency)} 涨至 ${formatMoney(
            today.currentPrice,
            today.currency
          )}，涨幅 ${formatPercent(priceChangeRate)}。`,
          oldValue: String(yesterday.currentPrice),
          newValue: String(today.currentPrice)
        });
      }
      const lowestPrice = input.historyLowestPrices[today.asin];
      if (lowestPrice !== null && lowestPrice !== undefined && today.currentPrice < lowestPrice) {
        pushChange("historical_low", today, yesterday, {
          alertType: "historical_low",
          alertLevel: "high",
          alertContent: `${today.asin} 当前价格低于历史低价 ${formatMoney(lowestPrice, today.currency)}。`,
          oldValue: String(lowestPrice),
          newValue: String(today.currentPrice)
        });
      }
    }

    const hasTodayCoupon = Boolean(today.couponText);
    const hadYesterdayCoupon = Boolean(yesterday.couponText);

    if (!hadYesterdayCoupon && hasTodayCoupon) {
      pushChange("new_coupon", today, yesterday, {
        alertType: "new_coupon",
        alertLevel: "medium",
        alertContent: `${today.asin} 新增 Coupon：${today.couponText}。`,
        oldValue: null,
        newValue: today.couponText
      });
    } else if (hadYesterdayCoupon && !hasTodayCoupon) {
      pushChange("coupon_disappeared", today, yesterday, {
        alertType: "coupon_disappeared",
        alertLevel: "low",
        alertContent: `${today.asin} Coupon 消失。`,
        oldValue: yesterday.couponText,
        newValue: null
      });
    } else if (hadYesterdayCoupon && hasTodayCoupon) {
      if ((today.couponValue ?? 0) > (yesterday.couponValue ?? 0) || (today.couponRate ?? 0) > (yesterday.couponRate ?? 0)) {
        pushChange("coupon_strengthened", today, yesterday);
      }
      if ((today.couponValue ?? 0) < (yesterday.couponValue ?? 0) || (today.couponRate ?? 0) < (yesterday.couponRate ?? 0)) {
        pushChange("coupon_weakened", today, yesterday);
      }
    }

    const rankDelta = yesterday.absoluteRank - today.absoluteRank;
    if (today.absoluteRank <= 10 && yesterday.absoluteRank > 10) {
      pushChange("entered_top_10", today, yesterday, {
        alertType: "entered_top_10",
        alertLevel: "high",
        alertContent: `${today.asin} 从第 ${yesterday.absoluteRank} 名进入前 10，当前第 ${today.absoluteRank} 名。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: String(today.absoluteRank)
      });
    } else if (today.absoluteRank <= 20 && yesterday.absoluteRank > 20) {
      pushChange("entered_top_20", today, yesterday, {
        alertType: "entered_top_20",
        alertLevel: "medium",
        alertContent: `${today.asin} 进入前 20，当前第 ${today.absoluteRank} 名。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: String(today.absoluteRank)
      });
    }
    if (rankDelta > 10) {
      pushChange("rank_up", today, yesterday);
    }
    if (rankDelta < -10) {
      pushChange("rank_down", today, yesterday);
    }

    if (!yesterday.isSponsored && today.isSponsored) {
      pushChange("new_sponsored", today, yesterday, {
        alertType: "new_sponsored",
        alertLevel: today.absoluteRank <= 10 ? "high" : "medium",
        alertContent: `${today.asin} 新增 Sponsored 标识，当前综合排名第 ${today.absoluteRank}。`,
        oldValue: "false",
        newValue: "true"
      });
    }
    if (yesterday.isSponsored && !today.isSponsored) {
      pushChange("sponsored_disappeared", today, yesterday, {
        alertType: "sponsored_disappeared",
        alertLevel: "low",
        alertContent: `${today.asin} Sponsored 标识消失。`,
        oldValue: "true",
        newValue: "false"
      });
    }
  }

  for (const yesterday of input.yesterday) {
    if (!todayByKey.has(snapshotKey(yesterday))) {
      pushChange("dropped_competitor", null, yesterday, {
        alertType: "dropped_from_results",
        alertLevel: "medium",
        alertContent: `${yesterday.asin} 昨日出现在 ${yesterday.keyword}，今日未出现在采集结果中。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: null
      });
    }
  }

  return { changes, alerts };
}

function snapshotKey(item: Pick<SerpSnapshot, "asin" | "keyword" | "marketplace">): string {
  return `${item.marketplace}::${item.keyword}::${item.asin}`;
}
