<script setup lang="ts">
import type { ProductActivityCalendar } from "@amazon-monitor/shared";
import { bestDayPrice, categoryLabel, changeLabel, formatCount, formatMoney, formatSignedCount, validCouponText, validDealBadge } from "../utils/formatters";

interface Props {
  productActivityCalendar: ProductActivityCalendar | null;
}

defineProps<Props>();
</script>

<template>
  <section v-if="productActivityCalendar" class="panel">
    <div class="panel-head">
      <h2>{{ productActivityCalendar.asin }} 活动日历</h2>
      <span>{{ productActivityCalendar.summary.activeDays }} 个活跃日 · {{ productActivityCalendar.summary.eventCount }} 条事件</span>
    </div>
    <div class="calendar-summary">
      <article>
        <span>最佳类目排名</span>
        <strong>{{ productActivityCalendar.summary.bestCategoryRank ? `#${productActivityCalendar.summary.bestCategoryRank}` : "-" }}</strong>
      </article>
      <article>
        <span>最新类目排名</span>
        <strong>{{ productActivityCalendar.summary.latestCategoryRank ? `#${productActivityCalendar.summary.latestCategoryRank}` : "-" }}</strong>
      </article>
      <article>
        <span>最佳关键词排名</span>
        <strong>{{ productActivityCalendar.summary.bestKeywordRank ? `#${productActivityCalendar.summary.bestKeywordRank}` : "-" }}</strong>
      </article>
      <article>
        <span>价格区间</span>
        <strong>{{ formatMoney(productActivityCalendar.summary.priceLow) }} - {{ formatMoney(productActivityCalendar.summary.priceHigh) }}</strong>
      </article>
      <article>
        <span>评价数</span>
        <strong>{{ formatCount(productActivityCalendar.summary.latestReviewCount) }} <small>{{ formatSignedCount(productActivityCalendar.summary.reviewCountChange) }}</small></strong>
      </article>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>类目排名</th>
            <th>关键词排名</th>
            <th>价格</th>
            <th>评价数</th>
            <th>促销</th>
            <th>活动</th>
            <th>BSR</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in productActivityCalendar.days" :key="day.date">
            <td>{{ day.date }}</td>
            <td>
              <span v-if="day.categoryRanks.length">#{{ day.categoryRanks[0].rank }} {{ categoryLabel(day.categoryRanks[0].categoryName) }}</span>
              <span v-else>-</span>
            </td>
            <td>
              <span v-if="day.keywordRanks.length">#{{ day.keywordRanks[0].absoluteRank }} {{ day.keywordRanks[0].keyword }}</span>
              <span v-else>-</span>
            </td>
            <td>{{ formatMoney(bestDayPrice(day)) }}</td>
            <td>{{ formatCount(day.priceHistory?.reviewCount ?? day.categoryRanks[0]?.reviewCount) }} <small>{{ formatSignedCount(day.priceHistory?.reviewCountChange) }}</small></td>
            <td>
              <span v-if="validDealBadge(day.categoryRanks[0]?.dealBadge ?? day.keywordRanks[0]?.dealBadge ?? null)">
                {{ validDealBadge(day.categoryRanks[0]?.dealBadge ?? day.keywordRanks[0]?.dealBadge ?? null) }}
              </span>
              <span v-else-if="validCouponText(day.categoryRanks[0]?.couponText ?? day.keywordRanks[0]?.couponText ?? null)">
                {{ validCouponText(day.categoryRanks[0]?.couponText ?? day.keywordRanks[0]?.couponText ?? null) }}
              </span>
              <span v-else>-</span>
            </td>
            <td class="target-cell">
              {{
                [
                  ...day.actionInsights.map((insight) => changeLabel(insight.insightType)),
                  ...day.events.map((event) => changeLabel(event.eventType)),
                  ...day.categorySignals.map((signal) => changeLabel(signal.signalType)),
                  ...day.keywordChanges.map((change) => changeLabel(change.changeType))
                ]
                  .slice(0, 4)
                  .join(" / ") || "-"
              }}
            </td>
            <td>
              <span v-if="day.bsrRanks.length">#{{ day.bsrRanks[0].rank }} {{ categoryLabel(day.bsrRanks[0].category) }}</span>
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
