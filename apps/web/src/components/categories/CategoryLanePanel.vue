<script setup lang="ts">
import { computed } from "vue";
import { ExternalLink } from "@lucide/vue";
import type { LaneEvent } from "../../composables/useCategoryDailyBriefing";

interface MiniRow {
  label: string;
  value: string;
}

interface Props {
  tone: "movers" | "promotions" | "fading";
  title: string;
  count: number;
  explainer: string;
  events: LaneEvent[];
  miniTableTitle: string;
  miniTableRows: MiniRow[];
  emptyText: string;
}

interface Emits {
  (e: "select", eventKey: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const cards = computed(() => props.events.slice(0, 4));
const moreCount = computed(() => Math.max(0, props.events.length - cards.value.length));

function rankDeltaText(delta: number | null): string {
  if (delta === null) return "—";
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

function rankDeltaTone(delta: number | null): "up" | "down" | "flat" | "neutral" {
  if (delta === null) return "neutral";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function openAmazon(asin: string | null): void {
  if (!asin) return;
  window.open(`https://www.amazon.com/dp/${asin}`, "_blank", "noopener,noreferrer");
}

function selectCard(eventKey: string): void {
  emit("select", eventKey);
}
</script>

<template>
  <section :class="['lane-panel', `lane-panel--${props.tone}`]">
    <header class="lane-panel-head">
      <h3>{{ props.title }} <span class="lane-panel-count">{{ props.count }}</span></h3>
      <p>{{ props.explainer }}</p>
    </header>

    <div v-if="cards.length" class="lane-panel-cards">
      <button
        v-for="lane in cards"
        :key="lane.event.eventKey"
        type="button"
        class="lane-card"
        :title="`查看 ${lane.brand} ${lane.changeLabel} 详情`"
        @click="selectCard(lane.event.eventKey)"
      >
        <div class="lane-card-meta">
          <strong>{{ lane.brand }}</strong>
          <small>{{ lane.asin ?? "品牌事件" }}</small>
        </div>
        <span :class="['lane-card-delta', `is-${rankDeltaTone(lane.rankDelta)}`]">
          {{ rankDeltaText(lane.rankDelta) }}
        </span>
        <span class="lane-card-tag">{{ lane.changeLabel }}</span>
        <span
          v-if="lane.asin"
          class="lane-card-open"
          role="button"
          tabindex="0"
          aria-label="在 Amazon 打开"
          @click.stop="openAmazon(lane.asin)"
          @keydown.enter.stop="openAmazon(lane.asin)"
          @keydown.space.prevent.stop="openAmazon(lane.asin)"
        >
          <ExternalLink :size="13" />
        </span>
      </button>
    </div>
    <p v-else class="lane-panel-empty">{{ props.emptyText }}</p>

    <div class="lane-panel-table">
      <header>
        <strong>{{ props.miniTableTitle }}</strong>
        <small v-if="moreCount > 0">+{{ moreCount }} 条未在卡片中展开</small>
      </header>
      <ul>
        <li v-for="row in props.miniTableRows" :key="row.label">
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </li>
        <li v-if="props.miniTableRows.length === 0" class="lane-panel-table-empty">暂无明细</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lane-panel {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
  padding: 12px 14px;
}

.lane-panel--movers { border-top: 3px solid #1d4ed8; }
.lane-panel--promotions { border-top: 3px solid #b45309; }
.lane-panel--fading { border-top: 3px solid #991b1b; }

.lane-panel-head h3 {
  align-items: center;
  color: var(--text-primary, #0f172a);
  display: inline-flex;
  font-size: 14px;
  gap: 6px;
  margin: 0;
}

.lane-panel-count {
  background: #f1f5f9;
  border-radius: 999px;
  color: var(--text-muted, #64748b);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
}

.lane-panel-head p {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
  margin: 4px 0 0;
}

.lane-panel-cards {
  display: grid;
  gap: 4px;
}

.lane-card {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 6px;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  padding: 6px 8px;
  text-align: left;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.lane-card:hover {
  background: #eef2ff;
  border-color: var(--color-primary-border, rgba(96, 165, 250, 0.5));
}

.lane-card:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: -2px;
}

.lane-card-meta strong {
  color: var(--text-primary, #0f172a);
  display: block;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lane-card-meta small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.lane-card-delta {
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
}

.lane-card-delta.is-up { background: #dcfce7; color: #166534; }
.lane-card-delta.is-down { background: #fee2e2; color: #991b1b; }
.lane-card-delta.is-flat { background: #f1f5f9; color: #475569; }
.lane-card-delta.is-neutral { background: #f1f5f9; color: #64748b; }

.lane-card-tag {
  color: var(--text-secondary, #475569);
  font-size: 11px;
  font-weight: 600;
}

.lane-card-open {
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary, #475569);
  cursor: pointer;
  display: inline-flex;
  height: 22px;
  justify-content: center;
  padding: 0;
  width: 24px;
}

.lane-card-open:hover {
  background: #f1f5f9;
  color: var(--color-primary, #2563eb);
}

.lane-panel-empty {
  color: var(--text-muted, #64748b);
  font-size: 12px;
  padding: 12px 0;
  text-align: center;
}

.lane-panel-table {
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
}

.lane-panel-table header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.lane-panel-table strong {
  color: var(--text-secondary, #475569);
  font-size: 12px;
}

.lane-panel-table small {
  color: var(--text-muted, #64748b);
  font-size: 11px;
}

.lane-panel-table ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}

.lane-panel-table li {
  align-items: center;
  display: flex;
  font-size: 11.5px;
  justify-content: space-between;
  padding: 2px 0;
}

.lane-panel-table li span {
  color: var(--text-muted, #64748b);
}

.lane-panel-table li strong {
  color: var(--text-primary, #0f172a);
  font-size: 12px;
}

.lane-panel-table-empty {
  color: var(--text-muted, #94a3b8);
  justify-content: center !important;
}
</style>