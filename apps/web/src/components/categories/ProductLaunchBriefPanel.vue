<script setup lang="ts">
import { ElButton, ElMessage, ElTag } from "element-plus";
import {
  CheckCircle2,
  ClipboardList,
  ClipboardCopy,
  Download,
  ListChecks,
  ShieldCheck,
  TableProperties,
  Target,
  Users
} from "@lucide/vue";
import type { AiDataFreshness, AiProductLaunchBrief } from "@amazon-monitor/shared";
import { useWriteAccess } from "../../composables/useWriteAccess";
import { useProductLaunchValidationTasks } from "../../composables/useProductLaunchValidationTasks";
import { formatProductLaunchBrief } from "../../utils/product-launch-brief";

const props = defineProps<{
  brief: AiProductLaunchBrief;
  runId?: number;
  dataFreshness?: AiDataFreshness;
}>();

const { canWrite } = useWriteAccess("manage_workflow");
const {
  creatingTasks,
  validationTasks,
  requiredGateCount,
  createValidationTasks
} = useProductLaunchValidationTasks(props);

async function copyBrief(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatProductLaunchBrief(props.brief, props.dataFreshness));
    ElMessage.success("新品立项草案已复制。");
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限。");
  }
}

function downloadBrief(): void {
  const blob = new Blob([formatProductLaunchBrief(props.brief, props.dataFreshness)], {
    type: "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `product-launch-brief-${props.brief.evidenceDate}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
  ElMessage.success("新品立项草案已下载。");
}

function formatPrice(value: number | null): string {
  if (value === null) return "暂无";
  return `${props.brief.priceBand.currency ? `${props.brief.priceBand.currency} ` : ""}${value.toFixed(2)}`;
}
</script>

<template>
  <section class="launch-brief">
    <header class="launch-brief__header">
      <div>
        <p class="eyebrow">Approval-gated artifact</p>
        <h3>{{ brief.title }}</h3>
        <span>{{ brief.marketplace }} · 证据日期 {{ brief.evidenceDate }}</span>
      </div>
      <div class="launch-brief__commands">
        <ElTag :type="brief.decision === 'validate' ? 'warning' : 'info'" effect="plain">
          {{ brief.decision === "validate" ? "进入人工验证" : "保持观察" }}
        </ElTag>
        <ElButton
          v-if="runId && canWrite && brief.decision === 'validate'"
          size="small"
          type="primary"
          plain
          :loading="creatingTasks"
          aria-label="创建立项验证任务"
          @click="createValidationTasks"
        >
          <CheckCircle2 v-if="validationTasks" :size="14" />
          <ClipboardList v-else :size="14" />
          {{ validationTasks ? `${validationTasks.requiredGateCount} 项任务已就绪` : `创建 ${requiredGateCount} 项任务` }}
        </ElButton>
        <ElButton size="small" aria-label="复制新品立项草案" @click="copyBrief">
          <ClipboardCopy :size="14" />
          复制
        </ElButton>
        <ElButton size="small" aria-label="下载新品立项草案" @click="downloadBrief">
          <Download :size="14" />
          Markdown
        </ElButton>
      </div>
    </header>

    <section class="launch-brief__thesis">
      <h4><Target :size="15" /> 机会判断</h4>
      <p>{{ brief.opportunityThesis }}</p>
      <div class="launch-brief__price-band">
        <span>最低 <strong>{{ formatPrice(brief.priceBand.minimum) }}</strong></span>
        <span>目标 <strong>{{ formatPrice(brief.priceBand.target) }}</strong></span>
        <span>最高 <strong>{{ formatPrice(brief.priceBand.maximum) }}</strong></span>
      </div>
      <small>{{ brief.priceBand.evidence }}</small>
    </section>

    <section class="launch-brief__pain">
      <h4><Users :size="15" /> 用户痛点证据</h4>
      <ElTag
        size="small"
        :type="brief.customerPainEvidence.status === 'data_gap' ? 'warning' : 'success'"
        effect="plain"
      >
        {{ brief.customerPainEvidence.status === "data_gap" ? "数据缺口" : "已有证据" }}
      </ElTag>
      <p>{{ brief.customerPainEvidence.conclusion }}</p>
      <ul>
        <li v-for="item in brief.customerPainEvidence.validationNeeded" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="launch-brief__section">
      <h4><TableProperties :size="15" /> 竞品矩阵</h4>
      <div class="launch-brief__table-wrap">
        <table>
          <thead>
            <tr><th>ASIN / 品牌</th><th>信号</th><th>BSR</th><th>价格</th><th>Review</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in brief.competitorMatrix" :key="item.asin">
              <td><strong>{{ item.asin }}</strong><span>{{ item.brand || "未知品牌" }}</span></td>
              <td>{{ item.signal }}</td>
              <td>#{{ item.rank }}</td>
              <td>{{ formatPrice(item.price) }}</td>
              <td>{{ item.reviewCount ?? "暂无" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="launch-brief__columns">
      <section class="launch-brief__section">
        <h4><Target :size="15" /> 差异化假设</h4>
        <article v-for="item in brief.differentiationHypotheses" :key="item.hypothesis">
          <strong>{{ item.hypothesis }}</strong>
          <p>{{ item.evidence.join(" · ") }}</p>
          <small>待验证：{{ item.validationNeeded }}</small>
        </article>
      </section>

      <section class="launch-brief__section">
        <h4><ListChecks :size="15" /> 立项门槛</h4>
        <article v-for="item in brief.validationChecklist" :key="item.item">
          <div><ElTag size="small" :type="item.gate === 'required' ? 'danger' : 'info'" effect="plain">
            {{ item.gate === "required" ? "必须" : "建议" }}
          </ElTag><strong>{{ item.item }}</strong></div>
          <p>{{ item.evidenceRequired }}</p>
        </article>
      </section>
    </div>

    <section class="launch-brief__risks">
      <h4><ShieldCheck :size="15" /> 风险边界</h4>
      <ul><li v-for="item in brief.riskNotes" :key="item">{{ item }}</li></ul>
    </section>
  </section>
</template>

<style scoped>
.launch-brief { container-type: inline-size; display: grid; gap: 12px; }
.launch-brief__header,
.launch-brief__commands,
.launch-brief h4,
.launch-brief__price-band,
.launch-brief__section article > div { align-items: center; display: flex; }
.launch-brief__header { border-top: 1px solid #e5e7eb; gap: 14px; justify-content: space-between; padding-top: 14px; }
.launch-brief__header h3,
.launch-brief__header p,
.launch-brief h4,
.launch-brief p { margin: 0; }
.launch-brief__header h3 { font-size: 15px; }
.launch-brief__header span { color: #6e6e73; font-size: 10px; }
.launch-brief__commands { flex-wrap: wrap; gap: 7px; }
.launch-brief h4 { color: #1d1d1f; font-size: 12px; gap: 6px; margin-bottom: 7px; }
.launch-brief__thesis,
.launch-brief__pain { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 7px; padding: 10px 12px; }
.launch-brief__thesis p,
.launch-brief__pain p { color: #344054; font-size: 11px; line-height: 1.55; }
.launch-brief__price-band { flex-wrap: wrap; gap: 8px 20px; margin-top: 9px; }
.launch-brief__price-band span { color: #6e6e73; font-size: 10px; }
.launch-brief__price-band strong { color: #1d1d1f; margin-left: 4px; }
.launch-brief__thesis small { color: #86868b; display: block; font-size: 9.5px; margin-top: 7px; }
.launch-brief__pain :deep(.el-tag) { float: right; margin-top: -25px; }
.launch-brief__pain ul,
.launch-brief__risks ul { color: #6e6e73; font-size: 10px; line-height: 1.5; margin: 7px 0 0; padding-left: 18px; }
.launch-brief__section { border-top: 1px solid #e5e7eb; display: grid; gap: 7px; padding-top: 11px; }
.launch-brief__table-wrap { overflow-x: auto; }
.launch-brief table { border-collapse: collapse; min-width: 660px; width: 100%; }
.launch-brief th,
.launch-brief td { border-bottom: 1px solid #e5e7eb; color: #475467; font-size: 10px; padding: 7px 8px; text-align: left; }
.launch-brief th { color: #667085; font-weight: 650; }
.launch-brief td:first-child { display: grid; gap: 2px; }
.launch-brief td strong { color: #1d1d1f; }
.launch-brief td span { color: #86868b; }
.launch-brief__columns { display: grid; gap: 12px; grid-template-columns: 1fr; }
.launch-brief__section article { background: #fbfbfd; border: 1px solid #e5e7eb; border-radius: 7px; padding: 9px 10px; }
.launch-brief__section article > div { gap: 6px; }
.launch-brief__section article strong { color: #1d1d1f; font-size: 11px; }
.launch-brief__section article p { color: #4b5563; font-size: 10px; line-height: 1.45; margin-top: 4px; }
.launch-brief__section article small { color: #86868b; display: block; font-size: 9.5px; line-height: 1.45; margin-top: 5px; }
.launch-brief__risks { background: #fff9ed; border: 1px solid #f5d89a; border-radius: 7px; padding: 10px 12px; }
.launch-brief__risks h4 { color: #8a4b08; }
.launch-brief__risks ul { color: #713f12; margin-top: 0; }
@media (max-width: 760px) {
  .launch-brief__header { align-items: stretch; flex-direction: column; }
  .launch-brief__commands { justify-content: space-between; }
}
@container (min-width: 760px) {
  .launch-brief__columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
