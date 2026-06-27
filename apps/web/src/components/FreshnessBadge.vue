<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Clock4 } from "@lucide/vue";
import type { CollectionFreshness } from "@amazon-monitor/shared";

interface Props {
  freshness: CollectionFreshness[];
}

const props = defineProps<Props>();

const keywordFreshness = computed(() => props.freshness.find((item) => item.taskType === "keyword") ?? null);
const categoryFreshness = computed(() => props.freshness.find((item) => item.taskType === "category") ?? null);

function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, ms / (1000 * 60 * 60));
}

function ageLabel(iso: string | null): string {
  const hours = ageHours(iso);
  if (hours === null) return "暂无数据";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟前`;
  if (hours < 24) return `${Math.round(hours)} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

type Severity = "fresh" | "aging" | "stale" | "failed" | "empty";

function severity(item: CollectionFreshness | null, staleHours: number): Severity {
  if (!item) return "empty";
  if (item.lastStatus === "failed") return "failed";
  if (item.lastCompletedAt === null) return "empty";
  const age = ageHours(item.lastCompletedAt) ?? 0;
  if (age < staleHours / 2) return "fresh";
  if (age < staleHours) return "aging";
  return "stale";
}

const KEYWORD_STALE_HOURS = 48; // 关键词数据两天未更新 = 过期
const CATEGORY_STALE_HOURS = 12; // 类目数据 12 小时未更新 = 过期

const keywordSeverity = computed(() => severity(keywordFreshness.value, KEYWORD_STALE_HOURS));
const categorySeverity = computed(() => severity(categoryFreshness.value, CATEGORY_STALE_HOURS));

function iconFor(sev: Severity) {
  if (sev === "failed" || sev === "stale") return AlertTriangle;
  if (sev === "empty") return Clock4;
  return CheckCircle2;
}

function tooltipFor(sev: Severity, item: CollectionFreshness | null): string {
  if (!item || !item.lastCompletedAt) return "尚无完成记录";
  if (sev === "failed") return `最近一次采集失败（${item.failedJobs} 次失败）`;
  if (sev === "stale") return "数据已过期，建议触发采集";
  if (sev === "aging") return "数据稍旧，下次采集前请谨慎参考";
  return "数据新鲜";
}
</script>

<template>
  <div class="freshness-bar">
    <span
      v-for="entry in [
        { label: '关键词', severity: keywordSeverity, item: keywordFreshness },
        { label: '类目', severity: categorySeverity, item: categoryFreshness }
      ]"
      :key="entry.label"
      :class="['freshness-chip', `is-${entry.severity}`]"
      :title="tooltipFor(entry.severity, entry.item)"
    >
      <component :is="iconFor(entry.severity)" :size="13" />
      <span class="freshness-label">{{ entry.label }}</span>
      <span class="freshness-age">{{ ageLabel(entry.item?.lastCompletedAt ?? null) }}</span>
    </span>
  </div>
</template>

<style scoped>
.freshness-bar {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.freshness-chip {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  padding: 3px 10px;
  white-space: nowrap;
}

.freshness-label {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.freshness-age {
  color: inherit;
  opacity: 0.85;
}

.is-fresh {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}

.is-aging {
  background: #fef3c7;
  border-color: #fde68a;
  color: #92400e;
}

.is-stale,
.is-failed {
  background: #fee2e2;
  border-color: #fecaca;
  color: #b91c1c;
}

.is-empty {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #475569;
}
</style>
