<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Eye, PackageSearch } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import {
  insightEventTypeLabels,
  type InsightEvent
} from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../../stores/insightEvents";
import InsightScoreBadge from "./InsightScoreBadge.vue";
import AttributionTags from "./AttributionTags.vue";
import StrategyTags from "./StrategyTags.vue";

const props = defineProps<{
  group: AsinGroupedView;
  expanded: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
  (event: "toggle-expand", asin: string): void;
}>();

const eventCount = computed(() => props.group.events.length);
const triggeredTypes = computed(() => {
  const seen = new Set<string>();
  const out: Array<{ type: InsightEvent["eventType"]; label: string }> = [];
  for (const event of props.group.events) {
    if (seen.has(event.eventType)) continue;
    seen.add(event.eventType);
    out.push({ type: event.eventType, label: insightEventTypeLabels[event.eventType] });
  }
  return out;
});

const rankSummary = computed(() => {
  const representative = props.group.representative;
  const previous = representative.evidence.previousRank;
  const current = representative.evidence.currentRank;
  if (previous === null && current === null) return "排名未采集";
  if (previous === null) return `新进 #${current}`;
  if (current === null) return `跌出 #${previous}`;
  return `#${previous} -> #${current}`;
});

const watchLabel = computed(() => {
  switch (props.group.watchLevel) {
    case "CORE":
      return "核心竞品";
    case "NORMAL":
      return "普通竞品";
    case "POTENTIAL":
      return "潜在竞品";
    case "IGNORED":
      return "已忽略";
    default:
      return null;
  }
});

function levelTagType(level: InsightEvent["eventLevel"]): "danger" | "warning" | "info" {
  if (level === "P0") return "danger";
  if (level === "P1") return "warning";
  return "info";
}

function watchTagType(): "danger" | "warning" | "info" {
  if (props.group.watchLevel === "CORE") return "danger";
  if (props.group.watchLevel === "POTENTIAL") return "warning";
  return "info";
}
</script>

<template>
  <article :class="['asin-card', `level-${group.topLevel}`, { 'is-expanded': expanded, 'is-core': group.watchLevel === 'CORE' }]">
    <header class="asin-card-head" @click="emit('toggle-expand', group.asin)">
      <InsightScoreBadge :score="group.scoreTotal" :level="group.representative.scoreLevel" />
      <img
        v-if="group.representative.evidence.imageUrl"
        :src="group.representative.evidence.imageUrl"
        :alt="group.representative.eventTitle"
        loading="lazy"
        decoding="async"
      />
      <div v-else class="asin-card-fallback">ASIN</div>
      <div class="asin-card-meta">
        <div class="asin-card-topline">
          <ElTag :type="levelTagType(group.topLevel)" effect="light" round>{{ group.topLevel }}</ElTag>
          <ElTag v-if="watchLabel" :type="watchTagType()" effect="plain" round>{{ watchLabel }}</ElTag>
          <ElTag effect="plain" round>{{ eventCount }} 条事件</ElTag>
        </div>
        <h4>{{ group.representative.brand || "未知品牌" }} / {{ group.asin }}</h4>
        <p>{{ rankSummary }}</p>
      </div>
      <div class="asin-card-side">
        <span v-if="eventCount > 1" class="more-pill">
          <AlertTriangle :size="13" />
          多事件触发
        </span>
        <span class="toggle-hint">{{ expanded ? "收起" : "展开" }}</span>
      </div>
    </header>

    <section v-if="expanded" class="asin-card-body">
      <div class="trigger-list">
        <p class="block-title">触发事件 ({{ eventCount }})</p>
        <ul>
          <li v-for="triggered in triggeredTypes" :key="triggered.type">
            <span class="trigger-type">{{ triggered.label }}</span>
            <span class="trigger-meta">{{ group.events.find((event) => event.eventType === triggered.type)?.eventTitle }}</span>
          </li>
        </ul>
      </div>

      <div v-if="group.attributionTags.length" class="tag-block">
        <p class="block-title">归因标签</p>
        <AttributionTags :tags="group.attributionTags" />
      </div>

      <div v-if="group.strategyTags.length" class="tag-block">
        <p class="block-title">策略标签</p>
        <StrategyTags :tags="group.strategyTags" />
      </div>

      <div v-if="group.representative.suggestedAction" class="suggested-block">
        <p class="block-title">建议动作</p>
        <p class="suggested-text">{{ group.representative.suggestedAction }}</p>
      </div>

      <ul class="event-mini-list">
        <li v-for="event in group.events" :key="event.id" @click.stop="emit('select', event)">
          <PackageSearch :size="14" />
          <span class="mini-title">{{ insightEventTypeLabels[event.eventType] }}</span>
          <span class="mini-score">{{ event.scoreTotal }} 分</span>
          <ElButton type="primary" size="small" class="mini-open" @click.stop="emit('select', event)">
            <Eye :size="13" />
            <span>打开详情</span>
          </ElButton>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.asin-card {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.asin-card:hover {
  border-color: #94a3b8;
}

.asin-card.is-expanded {
  border-color: #0f766e;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.15);
}

.asin-card.is-core {
  background: #fff7ed;
}

.asin-card-head {
  align-items: center;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: auto 64px minmax(0, 1fr) auto;
}

.asin-card-head img,
.asin-card-fallback {
  background: #eef2f7;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  height: 64px;
  object-fit: contain;
  width: 64px;
}

.asin-card-fallback {
  align-items: center;
  color: #64748b;
  display: flex;
  font-size: 11px;
  justify-content: center;
}

.asin-card-meta {
  min-width: 0;
}

.asin-card-topline {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.asin-card-meta h4 {
  color: #0f172a;
  font-size: 14px;
  margin: 6px 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asin-card-meta p {
  color: #475569;
  font-size: 12px;
  margin: 0;
}

.asin-card-side {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
}

.more-pill {
  align-items: center;
  background: #fef3c7;
  border-radius: 999px;
  color: #92400e;
  display: inline-flex;
  font-size: 11px;
  gap: 4px;
  padding: 3px 8px;
}

.toggle-hint {
  color: #64748b;
  font-size: 12px;
}

.asin-card-body {
  border-top: 1px dashed #d9e2ec;
  display: grid;
  gap: 10px;
  padding-top: 10px;
}

.block-title {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.trigger-list ul {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.trigger-list li {
  align-items: baseline;
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr);
}

.trigger-type {
  background: #f1f5f9;
  border-radius: 999px;
  color: #334155;
  font-size: 11px;
  padding: 3px 8px;
}

.trigger-meta {
  color: #0f172a;
  font-size: 12px;
}

.tag-block,
.suggested-block {
  background: #f8fafc;
  border-radius: 6px;
  padding: 8px 10px;
}

.suggested-text {
  color: #0f172a;
  font-size: 13px;
  margin: 0;
}

.event-mini-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.event-mini-list li {
  align-items: center;
  background: #f8fafc;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  padding: 6px 10px;
  transition: background 0.15s;
}

.event-mini-list li:hover {
  background: #e0f2fe;
}

.mini-title {
  color: #0f172a;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-score {
  color: #475569;
  font-size: 11px;
}

.mini-open {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}

@media (max-width: 760px) {
  .asin-card-head {
    grid-template-columns: auto 56px minmax(0, 1fr);
  }

  .asin-card-side {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: space-between;
  }
}
</style>
