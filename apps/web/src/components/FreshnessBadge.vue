<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Clock4 } from "@lucide/vue";
import type { CollectionFreshness } from "@amazon-monitor/shared";
import {
  snapshotDataSourceLabel,
  snapshotSyncStatusLabel
} from "../utils/snapshotProvenance";

type Severity = "fresh" | "aging" | "stale" | "failed" | "empty";

const props = defineProps<{
  freshness: CollectionFreshness[];
}>();

function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, ms / 3_600_000);
}

function ageLabel(iso: string | null): string {
  const hours = ageHours(iso);
  if (hours === null) return "暂无数据";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟前`;
  if (hours < 24) return `${Math.round(hours)} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function evidenceTime(item: CollectionFreshness | null): string | null {
  return item?.lastSyncedAt ?? item?.lastCompletedAt ?? null;
}

function severity(item: CollectionFreshness | null, staleHours: number): Severity {
  if (!item || !evidenceTime(item)) return "empty";
  if (item.syncStatus === "failed" || item.lastStatus === "failed") return "failed";
  const age = ageHours(evidenceTime(item)) ?? 0;
  if (age < staleHours / 2) return "fresh";
  if (age < staleHours) return "aging";
  return "stale";
}

function iconFor(value: Severity) {
  if (value === "failed" || value === "stale") return AlertTriangle;
  if (value === "empty") return Clock4;
  return CheckCircle2;
}

function details(entry: FreshnessEntry): string {
  const item = entry.item;
  if (!item) return `${entry.label}：暂无采集记录`;
  const parts = [
    `${entry.label}数据`,
    `来源：${snapshotDataSourceLabel(item.dataSource)}`,
    `状态：${snapshotSyncStatusLabel(item.syncStatus)}`,
    `更新时间：${item.lastSyncedAt ?? item.lastCompletedAt ?? "暂无"}`
  ];
  if (item.syncError) parts.push(`失败原因：${item.syncError}`);
  return parts.join("；");
}

interface FreshnessEntry {
  kind: CollectionFreshness["taskType"];
  label: string;
  item: CollectionFreshness | null;
  severity: Severity;
}

const entries = computed<FreshnessEntry[]>(() => [
  buildEntry("keyword", "关键词", 72),
  buildEntry("category", "类目", 12)
]);

function buildEntry(
  kind: CollectionFreshness["taskType"],
  label: string,
  staleHours: number
): FreshnessEntry {
  const item = props.freshness.find((candidate) => candidate.taskType === kind) ?? null;
  return { kind, label, item, severity: severity(item, staleHours) };
}
</script>

<template>
  <div class="freshness-bar" aria-label="数据新鲜度">
    <span
      v-for="entry in entries"
      :key="entry.kind"
      :class="['freshness-chip', `is-${entry.severity}`]"
      :title="details(entry)"
      :aria-label="details(entry)"
      role="status"
      tabindex="0"
    >
      <component :is="iconFor(entry.severity)" class="freshness-icon" :size="13" />
      <span class="freshness-identity">
        <strong>{{ entry.label }}</strong>
        <span class="freshness-status">{{ snapshotSyncStatusLabel(entry.item?.syncStatus) }}</span>
      </span>
      <small class="freshness-meta">
        {{ snapshotDataSourceLabel(entry.item?.dataSource) }} · {{ ageLabel(evidenceTime(entry.item)) }}
      </small>
    </span>
  </div>
</template>

<style scoped>
.freshness-bar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.freshness-chip {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  display: inline-flex;
  font-size: 11px;
  gap: 5px;
  line-height: 1;
  min-height: 28px;
  padding: 0 8px;
  white-space: nowrap;
}

.freshness-chip:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 2px;
}

.freshness-identity {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

.freshness-meta {
  font-size: inherit;
  opacity: 0.72;
}

.freshness-status {
  font-weight: 600;
}

.is-fresh {
  background: #eefaf2;
  border-color: rgba(22, 163, 74, 0.2);
  color: #166534;
}

.is-aging {
  background: #fff8e5;
  border-color: rgba(202, 138, 4, 0.2);
  color: #713f12;
}

.is-stale,
.is-failed {
  background: #fef2f2;
  border-color: rgba(220, 38, 38, 0.18);
  color: #991b1b;
}

.is-empty {
  background: #f2f2f7;
  border-color: rgba(29, 29, 31, 0.08);
  color: #515154;
}

@media (max-width: 760px) {
  .freshness-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .freshness-chip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto auto;
    min-height: 42px;
    padding-block: 5px;
  }

  .freshness-icon {
    grid-row: 1 / 3;
  }

  .freshness-identity,
  .freshness-meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
