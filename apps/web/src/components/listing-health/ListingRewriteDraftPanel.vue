<script setup lang="ts">
import { ElButton, ElMessage, ElTag } from "element-plus";
import { ClipboardCopy, Image, LayoutTemplate, ListChecks, ShieldCheck, Type } from "@lucide/vue";
import type { AiListingRewriteDraft } from "@amazon-monitor/shared";
import { formatListingRewriteDraft } from "../../utils/listing-rewrite-draft";

const props = defineProps<{
  draft: AiListingRewriteDraft;
}>();

async function copyDraft(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatListingRewriteDraft(props.draft));
    ElMessage.success("Listing 草案已复制。");
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限。");
  }
}
</script>

<template>
  <section class="listing-rewrite">
    <header class="listing-rewrite__header">
      <div>
        <p class="eyebrow">Approval-gated draft</p>
        <h3>Listing 改写草案</h3>
      </div>
      <div class="listing-rewrite__actions">
        <ElTag type="warning" effect="light">
          <ShieldCheck :size="13" />
          人工审核
        </ElTag>
        <ElButton size="small" aria-label="复制 Listing 草案" @click="copyDraft">
          <ClipboardCopy :size="14" />
          复制草案
        </ElButton>
      </div>
    </header>

    <section class="listing-rewrite__section">
      <h4><Type :size="15" /> 标题草案</h4>
      <p class="listing-rewrite__title">{{ draft.proposedTitle }}</p>
      <ul class="listing-rewrite__evidence">
        <li v-for="item in draft.titleEvidence" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="listing-rewrite__section">
      <h4><ListChecks :size="15" /> Bullet 草案</h4>
      <ol class="listing-rewrite__list">
        <li v-for="item in draft.bullets" :key="`${item.label}:${item.copy}`">
          <strong>{{ item.label }}</strong>
          <p>{{ item.copy }}</p>
          <small>{{ item.evidence.join(" · ") }}</small>
        </li>
      </ol>
    </section>

    <div class="listing-rewrite__columns">
      <section class="listing-rewrite__section">
        <h4><Image :size="15" /> 图片需求</h4>
        <article v-for="item in draft.imageBriefs" :key="`${item.slot}:${item.objective}`">
          <strong>{{ item.slot }}</strong>
          <p>{{ item.objective }}</p>
          <small>{{ item.evidence }}</small>
        </article>
      </section>

      <section class="listing-rewrite__section">
        <h4><LayoutTemplate :size="15" /> A+ 建议</h4>
        <article v-for="item in draft.aPlusModules" :key="`${item.module}:${item.objective}`">
          <strong>{{ item.module }}</strong>
          <p>{{ item.objective }}</p>
          <small>{{ item.evidence }}</small>
        </article>
      </section>
    </div>

    <section class="listing-rewrite__risks">
      <h4><ShieldCheck :size="15" /> 发布前检查</h4>
      <ul>
        <li v-for="item in draft.riskNotes" :key="item">{{ item }}</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.listing-rewrite { container-type: inline-size; display: grid; gap: 12px; }
.listing-rewrite__header,
.listing-rewrite__actions,
.listing-rewrite h4 { align-items: center; display: flex; }
.listing-rewrite__header { gap: 12px; justify-content: space-between; }
.listing-rewrite__header h3,
.listing-rewrite__header p,
.listing-rewrite h4,
.listing-rewrite p { margin: 0; }
.listing-rewrite__header h3 { font-size: 15px; }
.listing-rewrite__actions { gap: 7px; }
.listing-rewrite__actions :deep(.el-tag__content) { align-items: center; display: flex; gap: 4px; }
.listing-rewrite__section { border-top: 1px solid #e5e7eb; padding-top: 11px; }
.listing-rewrite h4 { color: #1d1d1f; font-size: 12px; gap: 6px; margin-bottom: 8px; }
.listing-rewrite__title { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 7px; color: #1d1d1f; font-size: 13px; font-weight: 650; line-height: 1.55; padding: 10px 12px; }
.listing-rewrite__evidence,
.listing-rewrite__risks ul { color: #6e6e73; font-size: 10px; line-height: 1.5; margin: 7px 0 0; padding-left: 18px; }
.listing-rewrite__list { display: grid; gap: 7px; list-style-position: inside; margin: 0; padding: 0; }
.listing-rewrite__list li,
.listing-rewrite__section article { background: #fbfbfd; border: 1px solid #e5e7eb; border-radius: 7px; padding: 9px 10px; }
.listing-rewrite__list strong,
.listing-rewrite__section article strong { color: #1d1d1f; font-size: 11px; }
.listing-rewrite__list p,
.listing-rewrite__section article p { color: #4b5563; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.listing-rewrite__list small,
.listing-rewrite__section article small { color: #86868b; display: block; font-size: 9.5px; line-height: 1.45; margin-top: 5px; }
.listing-rewrite__columns { display: grid; gap: 10px; grid-template-columns: 1fr; }
.listing-rewrite__columns .listing-rewrite__section { display: grid; gap: 7px; }
.listing-rewrite__columns h4 { margin-bottom: 1px; }
.listing-rewrite__risks { background: #fff9ed; border: 1px solid #f5d89a; border-radius: 7px; padding: 10px 12px; }
.listing-rewrite__risks h4 { color: #8a4b08; }
.listing-rewrite__risks ul { color: #713f12; margin-top: 0; }
@media (max-width: 760px) {
  .listing-rewrite__header { align-items: stretch; flex-direction: column; }
  .listing-rewrite__actions { justify-content: space-between; }
}
@container (min-width: 720px) {
  .listing-rewrite__columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
