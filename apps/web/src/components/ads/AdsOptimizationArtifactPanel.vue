<script setup lang="ts">
import { ElButton, ElMessage, ElTag } from "element-plus";
import { BadgeMinus, BanknoteArrowDown, BanknoteArrowUp, ClipboardCopy, Gauge, ShieldCheck, TriangleAlert } from "@lucide/vue";
import type { AiAdsOptimizationArtifact } from "@amazon-monitor/shared";
import { formatAdsOptimizationArtifact } from "../../utils/ads-optimization-artifact";

const props = defineProps<{ artifact: AiAdsOptimizationArtifact }>();

async function copyArtifact(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatAdsOptimizationArtifact(props.artifact));
    ElMessage.success("广告优化行动包已复制。");
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限。");
  }
}

function percent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}
</script>

<template>
  <section class="ads-artifact">
    <header class="ads-artifact__header">
      <div>
        <p class="eyebrow">Approval-gated optimization</p>
        <h3>广告优化行动包</h3>
        <span>证据日期 {{ artifact.evidenceDate }}</span>
      </div>
      <div class="ads-artifact__actions">
        <ElTag type="warning" effect="light"><ShieldCheck :size="13" /> 人工审核</ElTag>
        <ElButton size="small" aria-label="复制广告优化行动包" @click="copyArtifact">
          <ClipboardCopy :size="14" />
          复制
        </ElButton>
      </div>
    </header>

    <section v-if="artifact.wasteCandidates.length" class="ads-artifact__section">
      <h4><TriangleAlert :size="15" /> 浪费候选</h4>
      <article v-for="item in artifact.wasteCandidates" :key="`${item.campaign}:${item.target}`">
        <strong>{{ item.campaign }} · {{ item.target }}</strong>
        <div class="ads-artifact__metrics">
          <span>Spend <b>{{ item.spend ?? "-" }}</b></span>
          <span>Sales <b>{{ item.sales ?? "-" }}</b></span>
          <span>Clicks <b>{{ item.clicks ?? "-" }}</b></span>
        </div>
        <p>{{ item.reason }}</p>
        <small>{{ item.evidence.join(" · ") }}</small>
      </article>
    </section>

    <div class="ads-artifact__columns">
      <section class="ads-artifact__section">
        <h4><BadgeMinus :size="15" /> 待审核否词</h4>
        <article v-if="!artifact.negativeKeywordSuggestions.length" class="ads-artifact__empty">当前没有证据充分的否词候选。</article>
        <article v-for="item in artifact.negativeKeywordSuggestions" :key="`${item.campaign}:${item.term}`">
          <div><ElTag size="small">{{ item.matchType }}</ElTag><strong>{{ item.term }}</strong></div>
          <p>{{ item.reason }}</p>
          <small>{{ item.campaign }} · {{ item.evidence.join(" · ") }}</small>
        </article>
      </section>

      <section class="ads-artifact__section">
        <h4><Gauge :size="15" /> 出价建议</h4>
        <article v-for="item in artifact.bidAdjustments" :key="`${item.campaign}:${item.target}:${item.direction}`">
          <strong>{{ item.direction === "increase" ? "提高" : item.direction === "decrease" ? "降低" : "保持" }} {{ item.suggestedChangePercent ?? "-" }}%</strong>
          <p>{{ item.campaign }} · {{ item.target }}</p>
          <small>{{ item.reason }}</small>
        </article>
      </section>
    </div>

    <section class="ads-artifact__section">
      <h4><BanknoteArrowDown :size="15" /> 预算调整</h4>
      <article v-for="item in artifact.budgetAdjustments" :key="`${item.campaign}:${item.direction}`">
        <div>
          <ElTag :type="item.direction === 'increase' ? 'success' : 'warning'" size="small">{{ item.direction }}</ElTag>
          <strong>{{ item.campaign }} · {{ item.suggestedChangePercent ?? "-" }}%</strong>
        </div>
        <p>{{ item.reason }}</p>
        <small>{{ item.guardrails.join(" · ") }}</small>
      </article>
    </section>

    <section v-if="artifact.scaleCandidates.length" class="ads-artifact__section">
      <h4><BanknoteArrowUp :size="15" /> 可放量 Campaign</h4>
      <article v-for="item in artifact.scaleCandidates" :key="`${item.campaign}:${item.target}`">
        <strong>{{ item.campaign }} · {{ item.target }}</strong>
        <div class="ads-artifact__metrics">
          <span>ACOS <b>{{ percent(item.acos) }}</b></span>
          <span>CVR <b>{{ percent(item.cvr) }}</b></span>
          <span>预算使用 <b>{{ percent(item.budgetUsageRate) }}</b></span>
        </div>
        <p>{{ item.recommendation }}</p>
      </article>
    </section>

    <section class="ads-artifact__boundary">
      <div>
        <h4>数据缺口</h4>
        <ul><li v-for="item in artifact.dataGaps" :key="item">{{ item }}</li></ul>
      </div>
      <div>
        <h4>执行边界</h4>
        <ul><li v-for="item in artifact.riskNotes" :key="item">{{ item }}</li></ul>
      </div>
    </section>
  </section>
</template>

<style scoped>
.ads-artifact { container-type: inline-size; display: grid; gap: 11px; }
.ads-artifact__header,
.ads-artifact__actions,
.ads-artifact h4,
.ads-artifact__section article > div,
.ads-artifact__metrics { align-items: center; display: flex; }
.ads-artifact__header { gap: 12px; justify-content: space-between; }
.ads-artifact__header h3,
.ads-artifact__header p,
.ads-artifact h4,
.ads-artifact p { margin: 0; }
.ads-artifact__header h3 { font-size: 15px; }
.ads-artifact__header span { color: #6e6e73; font-size: 10px; }
.ads-artifact__actions { gap: 7px; }
.ads-artifact__actions :deep(.el-tag__content) { align-items: center; display: flex; gap: 4px; }
.ads-artifact__section { border-top: 1px solid #e5e7eb; display: grid; gap: 7px; padding-top: 10px; }
.ads-artifact h4 { color: #1d1d1f; font-size: 12px; gap: 6px; }
.ads-artifact__section article { background: #fbfbfd; border: 1px solid #e5e7eb; border-radius: 7px; padding: 9px 10px; }
.ads-artifact__section article > div { gap: 6px; }
.ads-artifact__section strong { color: #1d1d1f; font-size: 11px; }
.ads-artifact__section p { color: #4b5563; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.ads-artifact__section small { color: #86868b; display: block; font-size: 9.5px; line-height: 1.45; margin-top: 5px; }
.ads-artifact__metrics { flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; }
.ads-artifact__metrics span { color: #6e6e73; font-size: 10px; }
.ads-artifact__metrics b { color: #1d1d1f; margin-left: 3px; }
.ads-artifact__columns { display: grid; gap: 10px; grid-template-columns: 1fr; }
.ads-artifact__empty { color: #86868b; font-size: 10px; }
.ads-artifact__boundary { background: #fff9ed; border: 1px solid #f5d89a; border-radius: 7px; display: grid; gap: 10px; padding: 10px 12px; }
.ads-artifact__boundary h4 { color: #8a4b08; }
.ads-artifact__boundary ul { color: #713f12; font-size: 10px; line-height: 1.5; margin: 5px 0 0; padding-left: 18px; }
@media (max-width: 760px) {
  .ads-artifact__header { align-items: stretch; flex-direction: column; }
  .ads-artifact__actions { justify-content: space-between; }
}
@container (min-width: 720px) {
  .ads-artifact__columns,
  .ads-artifact__boundary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
