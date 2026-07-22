<script setup lang="ts">
import { ElButton, ElMessage, ElTag } from "element-plus";
import { ClipboardCopy, Factory, Headphones, Lightbulb, MessageSquareQuote, Scale, ShieldCheck } from "@lucide/vue";
import type { AiReviewVocArtifact } from "@amazon-monitor/shared";
import { formatReviewVocArtifact } from "../../utils/review-voc-artifact";

const props = defineProps<{ artifact: AiReviewVocArtifact }>();

async function copyArtifact(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatReviewVocArtifact(props.artifact));
    ElMessage.success("VOC 行动包已复制。");
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限。");
  }
}
</script>

<template>
  <section class="voc-artifact">
    <header class="voc-artifact__header">
      <div>
        <p class="eyebrow">Evidence-bound action pack</p>
        <h3>Review VOC 行动包</h3>
      </div>
      <div class="voc-artifact__actions">
        <ElTag type="warning" effect="light"><ShieldCheck :size="13" /> 人工审核</ElTag>
        <ElButton size="small" aria-label="复制 VOC 行动包" @click="copyArtifact">
          <ClipboardCopy :size="14" />
          复制
        </ElButton>
      </div>
    </header>

    <section class="voc-artifact__summary">
      <strong v-for="item in artifact.negativeSummary" :key="item">{{ item }}</strong>
    </section>

    <section class="voc-artifact__section">
      <h4><Factory :size="15" /> 供应商整改</h4>
      <article v-for="item in artifact.supplierActions" :key="`${item.topic}:${item.action}`">
        <div><ElTag size="small" :type="item.priority === 'P0' ? 'danger' : 'warning'">{{ item.priority }}</ElTag><strong>{{ item.topic }}</strong></div>
        <p>{{ item.action }}</p>
        <small>{{ item.evidence }}</small>
      </article>
    </section>

    <div class="voc-artifact__columns">
      <section class="voc-artifact__section">
        <h4><MessageSquareQuote :size="15" /> Listing 建议</h4>
        <ul><li v-for="item in artifact.listingRecommendations" :key="item">{{ item }}</li></ul>
      </section>

      <section class="voc-artifact__section">
        <h4><Headphones :size="15" /> 客服回复参考</h4>
        <article v-for="item in artifact.supportDrafts" :key="`${item.scenario}:${item.responseTemplate}`">
          <strong>{{ item.scenario }}</strong>
          <p>{{ item.responseTemplate }}</p>
          <small>{{ item.evidence }}</small>
        </article>
      </section>
    </div>

    <section class="voc-artifact__section">
      <h4><Lightbulb :size="15" /> 新品开发机会</h4>
      <article v-for="item in artifact.productOpportunities" :key="item.opportunity">
        <strong>{{ item.opportunity }}</strong>
        <p>{{ item.evidence }}</p>
        <small>待验证：{{ item.validationNeeded }}</small>
      </article>
    </section>

    <section class="voc-artifact__section">
      <h4><Scale :size="15" /> 竞品痛点对比</h4>
      <div class="voc-artifact__comparison">
        <article v-for="item in artifact.competitorPainComparison" :key="item.topic">
          <strong>{{ item.topic }}</strong>
          <span>我方：{{ item.ownProductEvidence }}</span>
          <span>竞品：{{ item.competitorEvidence ?? "暂无证据" }}</span>
          <small>{{ item.conclusion }}</small>
        </article>
      </div>
    </section>

    <section v-if="artifact.customerLanguage.length" class="voc-artifact__section">
      <h4><MessageSquareQuote :size="15" /> 用户原声</h4>
      <article v-for="item in artifact.customerLanguage" :key="item.evidenceReviewId">
        <strong>“{{ item.phrase }}”</strong>
        <p>{{ item.safeUse }}</p>
        <small>Review #{{ item.evidenceReviewId }} · {{ item.sentiment }}</small>
      </article>
    </section>

    <section class="voc-artifact__risks">
      <h4><ShieldCheck :size="15" /> 决策边界</h4>
      <ul><li v-for="item in artifact.riskNotes" :key="item">{{ item }}</li></ul>
    </section>
  </section>
</template>

<style scoped>
.voc-artifact { container-type: inline-size; display: grid; gap: 11px; }
.voc-artifact__header,
.voc-artifact__actions,
.voc-artifact h4,
.voc-artifact__section article > div { align-items: center; display: flex; }
.voc-artifact__header { gap: 12px; justify-content: space-between; }
.voc-artifact__header h3,
.voc-artifact__header p,
.voc-artifact h4,
.voc-artifact p { margin: 0; }
.voc-artifact__header h3 { font-size: 15px; }
.voc-artifact__actions { gap: 7px; }
.voc-artifact__actions :deep(.el-tag__content) { align-items: center; display: flex; gap: 4px; }
.voc-artifact__summary { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-artifact__summary strong { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; color: #9a3412; font-size: 10px; padding: 4px 7px; }
.voc-artifact__section { border-top: 1px solid #e5e7eb; display: grid; gap: 7px; padding-top: 10px; }
.voc-artifact h4 { color: #1d1d1f; font-size: 12px; gap: 6px; }
.voc-artifact__section article,
.voc-artifact__section ul { background: #fbfbfd; border: 1px solid #e5e7eb; border-radius: 7px; margin: 0; padding: 9px 10px; }
.voc-artifact__section article > div { gap: 6px; }
.voc-artifact__section article strong { color: #1d1d1f; font-size: 11px; }
.voc-artifact__section article p,
.voc-artifact__section li { color: #4b5563; font-size: 11px; line-height: 1.5; }
.voc-artifact__section article p { margin-top: 4px; }
.voc-artifact__section article small { color: #86868b; display: block; font-size: 9.5px; line-height: 1.45; margin-top: 5px; }
.voc-artifact__section ul { display: grid; gap: 5px; padding-left: 26px; }
.voc-artifact__columns { display: grid; gap: 10px; grid-template-columns: 1fr; }
.voc-artifact__comparison { display: grid; gap: 7px; }
.voc-artifact__comparison article { display: grid; gap: 3px; }
.voc-artifact__comparison span { color: #4b5563; font-size: 10px; }
.voc-artifact__risks { background: #fff9ed; border: 1px solid #f5d89a; border-radius: 7px; padding: 10px 12px; }
.voc-artifact__risks h4 { color: #8a4b08; }
.voc-artifact__risks ul { color: #713f12; font-size: 10px; line-height: 1.5; margin: 6px 0 0; padding-left: 18px; }
@media (max-width: 760px) {
  .voc-artifact__header { align-items: stretch; flex-direction: column; }
  .voc-artifact__actions { justify-content: space-between; }
}
@container (min-width: 720px) {
  .voc-artifact__columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .voc-artifact__comparison { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
