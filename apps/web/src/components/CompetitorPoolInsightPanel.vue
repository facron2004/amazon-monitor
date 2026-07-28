<script setup lang="ts">
import {
  Lightbulb,
  ChevronRight,
  Flame,
  BadgePercent,
  Layers,
  ExternalLink,
  type LucideIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useCompetitorStore } from "../stores/competitor";

const store = useCompetitorStore();
const { competitorInsightSuggestion, yesterdayKpiDelta } = storeToRefs(store);

const emit = defineEmits<{
  (event: "open-insights", asin?: string): void;
}>();

function openAmazonByAsin(asin: string): void {
  window.open(
    `https://www.amazon.com/dp/${asin}`,
    "_blank",
    "noopener,noreferrer",
  );
}

const TONE_ICON: Record<"price" | "activity" | "core" | "neutral", LucideIcon> =
  {
    price: Flame,
    activity: BadgePercent,
    core: Layers,
    neutral: Flame,
  };

function statDelta(
  tone: "price" | "activity" | "core" | "neutral",
): number | null {
  if (tone === "price") return yesterdayKpiDelta.value.priceActive;
  if (tone === "core") return yesterdayKpiDelta.value.core;
  return null;
}

function statDeltaText(
  tone: "price" | "activity" | "core" | "neutral",
): string {
  const delta = statDelta(tone);
  if (delta === null) return "较昨日 -";
  if (delta > 0) return `较昨日 +${delta}`;
  return `较昨日 ${delta}`;
}
</script>

<template>
  <aside class="competitor-insight">
    <header>
      <span class="competitor-insight-light">
        <Lightbulb :size="14" />
      </span>
      <strong>竞品洞察建议</strong>
    </header>

    <div class="competitor-insight-headline">
      <small>建议优先关注</small>
      <p>{{ competitorInsightSuggestion.headline }}</p>
      <p class="competitor-insight-body">
        {{ competitorInsightSuggestion.body }}
      </p>
    </div>

    <ul class="competitor-insight-stats">
      <li
        v-for="stat in competitorInsightSuggestion.stats"
        :key="stat.label"
        :class="`is-${stat.tone}`"
      >
        <span class="competitor-insight-stat-icon">
          <component :is="TONE_ICON[stat.tone]" :size="12" />
        </span>
        <div>
          <strong>{{ stat.value }}</strong>
          <small>{{ stat.label }}</small>
        </div>
        <em>{{ statDeltaText(stat.tone) }}</em>
      </li>
    </ul>

    <div
      v-if="competitorInsightSuggestion.topItems.length"
      class="competitor-insight-top"
    >
      <small>重点关注 ASIN</small>
      <ul>
        <li
          v-for="item in competitorInsightSuggestion.topItems"
          :key="item.asin"
        >
          <button
            type="button"
            class="competitor-insight-top-main"
            @click="emit('open-insights', item.asin)"
          >
            <span>
              <strong>{{ item.brand || "未知品牌" }}</strong>
              <small class="competitor-insight-asin">{{ item.asin }}</small>
            </span>
            <ChevronRight :size="14" />
          </button>
          <button
            type="button"
            class="competitor-insight-top-external"
            :aria-label="`在 Amazon 打开 ${item.asin}`"
            title="在 Amazon 打开"
            @click="openAmazonByAsin(item.asin)"
          >
            <ExternalLink :size="13" />
          </button>
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="competitor-insight-detail"
      @click="emit('open-insights')"
    >
      <span>进入核心竞品案卷</span>
      <ChevronRight :size="14" />
    </button>
  </aside>
</template>

<style scoped>
.competitor-insight {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
}

.competitor-insight header {
  align-items: center;
  display: flex;
  gap: 8px;
}

.competitor-insight header strong {
  color: var(--text-primary, #0f172a);
  font-size: 13.5px;
}

.competitor-insight-light {
  align-items: center;
  background: #dbeafe;
  border-radius: 999px;
  color: #1d4ed8;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.competitor-insight-headline {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 10px 12px;
}

.competitor-insight-headline small {
  color: #1d4ed8;
  display: block;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.competitor-insight-headline p {
  color: #1e40af;
  font-size: 13px;
  font-weight: 600;
  margin: 4px 0 0;
}

.competitor-insight-body {
  color: #1e3a8a !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  margin-top: 6px !important;
}

.competitor-insight-stats {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.competitor-insight-stats li {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 1fr auto;
  padding: 6px 10px;
}

.competitor-insight-stat-icon {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  height: 22px;
  justify-content: center;
  width: 22px;
}

.competitor-insight-stats li.is-price .competitor-insight-stat-icon {
  background: #fee2e2;
  color: #991b1b;
}
.competitor-insight-stats li.is-activity .competitor-insight-stat-icon {
  background: #ccfbf1;
  color: #0f766e;
}
.competitor-insight-stats li.is-core .competitor-insight-stat-icon {
  background: #ede9fe;
  color: #6d28d9;
}
.competitor-insight-stats li.is-neutral .competitor-insight-stat-icon {
  background: #f1f5f9;
  color: #64748b;
}

.competitor-insight-stats li strong {
  color: var(--text-primary, #0f172a);
  font-size: 14px;
  line-height: 1.1;
}

.competitor-insight-stats li small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
}

.competitor-insight-stats li em {
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
}

.competitor-insight-top small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.4;
  margin-bottom: 6px;
}

.competitor-insight-top ul {
  display: grid;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.competitor-insight-top li {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  overflow: hidden;
}

.competitor-insight-top button {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.competitor-insight-top-main {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
  padding: 5px 8px;
  text-align: left;
}

.competitor-insight-top-main span {
  min-width: 0;
}

.competitor-insight-top button:hover {
  background: #f1f5f9;
}

.competitor-insight-top-external {
  align-self: stretch;
  border-left: 1px solid var(--border-color) !important;
  color: var(--text-muted, #64748b) !important;
  display: inline-flex;
  justify-content: center;
  padding: 0;
}

.competitor-insight-top-external svg {
  flex: 0 0 auto;
}

.competitor-insight-top strong {
  color: var(--text-primary, #0f172a);
  font-size: 12px;
}

.competitor-insight-asin {
  color: var(--text-muted, #64748b);
  display: block;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.competitor-insight-detail {
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--color-primary, #2563eb);
  border-radius: 8px;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  gap: 4px;
  justify-content: center;
  padding: 8px 12px;
}

.competitor-insight-detail:hover {
  background: var(--color-primary, #2563eb);
  color: #ffffff;
}
</style>
