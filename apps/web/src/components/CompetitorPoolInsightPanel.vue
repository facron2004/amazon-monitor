<script setup lang="ts">
import { Lightbulb, ChevronRight, Flame, BadgePercent, Layers, type LucideIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useCompetitorStore } from "../stores/competitor";

const store = useCompetitorStore();
const { competitorInsightSuggestion } = storeToRefs(store);

function openAmazonByAsin(asin: string): void {
  window.open(`https://www.amazon.com/dp/${asin}`, "_blank", "noopener,noreferrer");
}

const TONE_ICON: Record<"price" | "activity" | "core" | "neutral", LucideIcon> = {
  price: Flame,
  activity: BadgePercent,
  core: Layers,
  neutral: Flame
};
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
      <p class="competitor-insight-body">{{ competitorInsightSuggestion.body }}</p>
    </div>

    <ul class="competitor-insight-stats">
      <li v-for="stat in competitorInsightSuggestion.stats" :key="stat.label" :class="`is-${stat.tone}`">
        <span class="competitor-insight-stat-icon">
          <component :is="TONE_ICON[stat.tone]" :size="12" />
        </span>
        <div>
          <strong>{{ stat.value }}</strong>
          <small>{{ stat.label }}</small>
        </div>
        <em>较昨日 +0</em>
      </li>
    </ul>

    <div v-if="competitorInsightSuggestion.topItems.length" class="competitor-insight-top">
      <small>重点关注 ASIN</small>
      <ul>
        <li v-for="item in competitorInsightSuggestion.topItems" :key="item.asin">
          <button type="button" @click="openAmazonByAsin(item.asin)">
            <strong>{{ item.brand || "未知品牌" }}</strong>
            <small>{{ item.asin }}</small>
          </button>
        </li>
      </ul>
    </div>

    <button type="button" class="competitor-insight-detail">
      <span>查看详细洞察</span>
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
  background: #fef3c7;
  border-radius: 999px;
  color: #b45309;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.competitor-insight-headline {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 10px 12px;
}

.competitor-insight-headline small {
  color: #92400e;
  display: block;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.competitor-insight-headline p {
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
  margin: 4px 0 0;
}

.competitor-insight-body {
  color: #78350f !important;
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

.competitor-insight-stats li.is-price .competitor-insight-stat-icon { background: #fee2e2; color: #991b1b; }
.competitor-insight-stats li.is-activity .competitor-insight-stat-icon { background: #ffedd5; color: #b45309; }
.competitor-insight-stats li.is-core .competitor-insight-stat-icon { background: #ede9fe; color: #6d28d9; }
.competitor-insight-stats li.is-neutral .competitor-insight-stat-icon { background: #f1f5f9; color: #64748b; }

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
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.competitor-insight-top ul {
  display: grid;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.competitor-insight-top button {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 8px;
  padding: 5px 8px;
  text-align: left;
  width: 100%;
}

.competitor-insight-top button:hover {
  background: #f1f5f9;
}

.competitor-insight-top strong {
  color: var(--text-primary, #0f172a);
  font-size: 12px;
}

.competitor-insight-top small {
  color: var(--text-muted, #64748b);
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 10.5px;
  letter-spacing: 0;
  margin: 0;
  text-transform: none;
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