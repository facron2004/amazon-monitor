<script setup lang="ts">
import { computed } from "vue";
import type { CompetitorActionInsight, CompetitorActivityEvent } from "@amazon-monitor/shared";
import { categoryLabel, changeLabel, formatCount, formatMoney, localizeGeneratedText } from "../utils/formatters";
import { compactText, levelWeight, rankPath } from "../utils/category-intelligence";

interface Props {
  filteredActivityEvents: CompetitorActivityEvent[];
  visibleActionInsights: CompetitorActionInsight[];
}

const props = defineProps<Props>();

const focusQueue = computed(() => {
  const insightCards = props.visibleActionInsights.map((item) => ({
    key: `insight-${item.sourceType}-${item.category}-${item.asin || item.brand}-${item.insightType}`,
    tone: item.confidence ?? "medium",
    lane: "动作洞察",
    label: changeLabel(item.insightType),
    target: item.asin || item.brand || "-",
    subtitle: compactText(item.title || categoryLabel(item.category), 74),
    path: rankPath(item.previousRank, item.currentRank),
    meta: item.previousDate ? `${item.previousDate} → ${item.insightDate}` : item.insightDate,
    note: compactText(localizeGeneratedText(item.suggestedResponse || item.inferredAction), 110)
  }));

  const eventCards = props.filteredActivityEvents.map((item) => ({
    key: `event-${item.eventKey}`,
    tone: item.eventLevel ?? "medium",
    lane: "活动事件",
    label: changeLabel(item.eventType),
    target: item.asin || item.brand || "-",
    subtitle: compactText(item.title || localizeGeneratedText(item.eventSummary), 74),
    path: rankPath(item.rankBefore, item.rankAfter),
    meta:
      item.priceBefore !== null || item.priceAfter !== null
        ? `${formatMoney(item.priceBefore)} → ${formatMoney(item.priceAfter)}`
        : `${formatCount(item.reviewCountBefore)} → ${formatCount(item.reviewCountAfter)}`,
    note: compactText(localizeGeneratedText(item.suggestedAction || item.possibleStrategy), 110)
  }));

  return [...insightCards, ...eventCards]
    .sort((left, right) => levelWeight(right.tone) - levelWeight(left.tone))
    .slice(0, 4);
});
</script>

<template>
  <section class="panel dense-panel focus-queue-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>重点对象队列</h2>
        <p class="panel-caption">把高波动、高置信度和需要跟进的对象提到前排，减少在事件表里来回扫读的成本。</p>
      </div>
      <span>{{ focusQueue.length }} 项优先处理</span>
    </div>

    <div class="focus-queue-grid">
      <article v-for="item in focusQueue" :key="item.key" :class="['focus-card', `focus-card--${item.tone}`]">
        <div class="focus-card-head">
          <span class="focus-chip">{{ item.lane }}</span>
          <span class="focus-chip focus-chip-soft">{{ item.label }}</span>
        </div>
        <strong>{{ item.target }}</strong>
        <small>{{ item.subtitle }}</small>
        <div class="focus-card-path">
          <span>{{ item.path }}</span>
          <span>{{ item.meta }}</span>
        </div>
        <p>{{ item.note }}</p>
      </article>
    </div>
  </section>
</template>
