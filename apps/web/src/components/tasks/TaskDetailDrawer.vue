<script setup lang="ts">
import { computed } from "vue";
import { ElDrawer, ElSkeleton, ElTag } from "element-plus";
import { BookOpen, BrainCircuit, ChartNoAxesCombined, ClipboardCheck, FileText, Link2 } from "@lucide/vue";
import { taskStatusLabels, taskTypeLabels, type AiRun, type InsightEvent, type Task } from "@amazon-monitor/shared";
import { mergeTaskMetricComparisons } from "../../utils/task-metrics.js";

interface EvidenceMetric {
  label: string;
  before: string | null;
  after: string | null;
}

const props = defineProps<{
  task: Task | null;
  sourceEvent: InsightEvent | null;
  sourceAiRun: AiRun | null;
  loading: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const visible = computed({
  get: () => props.task !== null,
  set: (value: boolean) => {
    if (!value) emit("close");
  }
});

const metrics = computed(() => mergeTaskMetricComparisons(
  props.task?.resultBeforeJson,
  props.task?.resultAfterJson
));

const aiRecommendation = computed(() => {
  return props.task?.aiRecommendation?.trim() || props.sourceEvent?.suggestedAction?.trim() || null;
});

const sourceLabel = computed(() => {
  const task = props.task;
  if (!task) return null;
  if (task.sourceType === "rule") return "规则 / 运营计划";
  if (task.sourceType === "manual") return "人工创建";
  if (task.sourceType === "review_recurring") return "周期复盘";
  return null;
});

const recommendationTitle = computed(() =>
  props.task?.sourceType === "ai_run" || props.sourceEvent ? "AI 建议" : "建议动作"
);

const taskDescription = computed(() => {
  const task = props.task;
  if (!task) return "";
  const sourceMarkerIndex = task.sourceType === "insight_event" ? task.description.lastIndexOf("\n\n[") : -1;
  return sourceMarkerIndex >= 0 ? task.description.slice(0, sourceMarkerIndex) : task.description;
});

const evidenceMetrics = computed<EvidenceMetric[]>(() => {
  const evidence = props.sourceEvent?.evidence;
  if (!evidence) return [];
  return [
    comparison("BSR 排名", formatRank(evidence.previousRank), formatRank(evidence.currentRank)),
    comparison("价格", formatPrice(evidence.priceBefore), formatPrice(evidence.priceAfter)),
    comparison("Review", formatCount(evidence.reviewCountBefore), formatCount(evidence.reviewCountAfter)),
    comparison("Coupon", evidence.couponBefore ?? null, evidence.couponAfter ?? null),
    comparison("Deal", null, evidence.dealType ?? null)
  ].filter((metric): metric is EvidenceMetric => metric !== null);
});

const reviewLabels: Record<NonNullable<Task["reviewResult"]>, string> = {
  CONFIRMED: "判断成立",
  REVERTED: "短期冲榜后回落",
  CONTINUING: "仍在持续",
  FAILED: "机会消失",
  UNCLEAR: "数据不足"
};

function comparison(label: string, before: string | null, after: string | null): EvidenceMetric | null {
  return before || after ? { label, before, after } : null;
}

function formatRank(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `#${value}`;
}

function formatPrice(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `$${value.toFixed(2)}`;
}

function formatCount(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    :title="task ? `任务详情｜${task.title}` : '任务详情'"
    direction="rtl"
    size="min(680px, 100%)"
    append-to-body
    destroy-on-close
  >
    <div v-if="task" class="task-detail">
      <section class="task-detail__overview">
        <div>
          <span class="task-detail__eyebrow">任务状态</span>
          <div class="task-detail__tags">
            <ElTag size="small" :type="task.priority === 'P0' ? 'danger' : task.priority === 'P1' ? 'warning' : 'info'">
              {{ task.priority }}
            </ElTag>
            <ElTag size="small" effect="plain">{{ taskStatusLabels[task.status] }}</ElTag>
            <ElTag size="small" type="info" effect="plain">{{ taskTypeLabels[task.taskType] }}</ElTag>
          </div>
        </div>
        <span class="task-detail__updated">更新于 {{ task.updatedAt.slice(0, 16).replace('T', ' ') }}</span>
      </section>

      <section class="task-detail__section">
        <header><FileText :size="16" /><h3>任务背景</h3></header>
        <p class="task-detail__copy">{{ taskDescription || '该任务尚未补充背景说明。' }}</p>
        <dl class="task-detail__metadata">
          <div v-if="task.relatedAsin"><dt>ASIN</dt><dd>{{ task.relatedAsin }}</dd></div>
          <div v-if="task.relatedBrand"><dt>品牌</dt><dd>{{ task.relatedBrand }}</dd></div>
          <div v-if="task.relatedKeyword"><dt>关键词</dt><dd>{{ task.relatedKeyword }}</dd></div>
          <div v-if="task.dueDate"><dt>截止日期</dt><dd>{{ task.dueDate }}</dd></div>
        </dl>
      </section>

      <section class="task-detail__section">
        <header><Link2 :size="16" /><h3>来源与证据</h3></header>
        <ElSkeleton v-if="loading" :rows="4" animated />
        <template v-else-if="sourceAiRun">
          <p class="task-detail__event-title">来源：{{ sourceAiRun.agentType }} Agent · Run #{{ sourceAiRun.id }}</p>
          <p class="task-detail__source-meta">{{ sourceAiRun.model }} · {{ sourceAiRun.status }} · {{ sourceAiRun.createdAt.slice(0, 16).replace('T', ' ') }}</p>
        </template>
        <template v-else-if="sourceEvent">
          <p class="task-detail__event-title">{{ sourceEvent.eventTitle }}</p>
          <p class="task-detail__source-meta">事件日期 {{ sourceEvent.eventDate }} · {{ sourceEvent.eventLevel }} · 评分 {{ sourceEvent.scoreTotal }}</p>
          <div v-if="evidenceMetrics.length" class="task-detail__evidence-grid">
            <div v-for="metric in evidenceMetrics" :key="metric.label" class="task-detail__evidence">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.after ?? '—' }}</strong>
              <small v-if="metric.before">{{ metric.before }} →</small>
            </div>
          </div>
          <ul v-if="sourceEvent.evidence.evidenceItems.length" class="task-detail__evidence-list">
            <li v-for="item in sourceEvent.evidence.evidenceItems" :key="item">{{ item }}</li>
          </ul>
        </template>
        <template v-else-if="sourceLabel">
          <p class="task-detail__event-title">来源：{{ sourceLabel }}</p>
          <p class="task-detail__source-meta">{{ task.sourceId ? `证据标识 ${task.sourceId}` : "未绑定外部快照" }}</p>
        </template>
        <p v-else class="task-detail__muted">该任务没有可展示的来源快照。</p>
      </section>

      <section class="task-detail__section">
        <header><BrainCircuit :size="16" /><h3>{{ recommendationTitle }}</h3></header>
        <p v-if="aiRecommendation" class="task-detail__copy">{{ aiRecommendation }}</p>
        <p v-else class="task-detail__muted">暂无 AI 建议。</p>
        <p class="task-detail__guardrail">建议仅供人工判断，高风险操作仍需人工确认。</p>
      </section>

      <section class="task-detail__section">
        <header><ClipboardCheck :size="16" /><h3>人工执行与结果</h3></header>
        <p v-if="task.actionTaken" class="task-detail__copy">{{ task.actionTaken }}</p>
        <p v-else class="task-detail__muted">尚未登记执行动作。</p>
        <div v-if="metrics.length" class="task-detail__metrics">
          <div class="task-detail__metric-head"><span>指标</span><span>执行前</span><span>执行后</span></div>
          <div v-for="metric in metrics" :key="`${metric.label}-${metric.unit}`" class="task-detail__metric-row">
            <span>{{ metric.label }}<small v-if="metric.unit"> · {{ metric.unit }}</small></span>
            <strong>{{ metric.before ?? '—' }}</strong>
            <strong>{{ metric.after ?? '—' }}</strong>
          </div>
        </div>
      </section>

      <section class="task-detail__section">
        <header><ChartNoAxesCombined :size="16" /><h3>复盘与 SOP</h3></header>
        <p v-if="task.reviewResult" class="task-detail__review-result">{{ reviewLabels[task.reviewResult] }}</p>
        <p v-if="task.reviewNote" class="task-detail__copy">{{ task.reviewNote }}</p>
        <p v-if="!task.reviewResult && !task.reviewNote" class="task-detail__muted">任务完成后可在此记录复盘结论。</p>
        <div class="task-detail__sop">
          <BookOpen :size="15" />
          <span v-if="task.promotedToSopId">已沉淀为 SOP #{{ task.promotedToSopId }}</span>
          <span v-else>尚未沉淀为 SOP</span>
        </div>
      </section>
    </div>
  </ElDrawer>
</template>

<style scoped>
.task-detail { display: grid; gap: 24px; padding: 0 4px 20px; }
.task-detail__overview { align-items: flex-start; display: flex; gap: 16px; justify-content: space-between; }
.task-detail__eyebrow, .task-detail__updated, .task-detail__muted, .task-detail__guardrail { color: #667085; font-size: 12px; }
.task-detail__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.task-detail__updated { text-align: right; white-space: nowrap; }
.task-detail__section { border-top: 1px solid #eaecf0; padding-top: 16px; }
.task-detail__section header { align-items: center; color: #344054; display: flex; gap: 8px; margin-bottom: 10px; }
.task-detail__section h3 { font-size: 14px; margin: 0; }
.task-detail__copy { color: #475467; line-height: 1.65; margin: 0; white-space: pre-wrap; }
.task-detail__metadata { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 14px 0 0; }
.task-detail__metadata div { display: flex; gap: 6px; }
.task-detail__metadata dt { color: #667085; font-size: 12px; }
.task-detail__metadata dd { color: #344054; font-size: 12px; margin: 0; }
.task-detail__event-title { color: #1d2939; font-weight: 700; line-height: 1.45; margin: 0 0 6px; }
.task-detail__source-meta { color: #667085; font-size: 12px; margin: 0; }
.task-detail__evidence-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
.task-detail__evidence { border-left: 2px solid #84adf8; display: grid; gap: 2px; min-width: 0; padding-left: 9px; }
.task-detail__evidence span, .task-detail__evidence small { color: #667085; font-size: 11px; }
.task-detail__evidence strong { color: #1d2939; font-size: 14px; }
.task-detail__evidence-list { color: #667085; display: grid; font-size: 12px; gap: 6px; line-height: 1.5; margin: 14px 0 0; padding-left: 18px; }
.task-detail__guardrail { border-left: 2px solid #f0b65e; line-height: 1.5; margin: 12px 0 0; padding-left: 8px; }
.task-detail__metrics { border: 1px solid #eaecf0; margin-top: 14px; overflow: hidden; }
.task-detail__metric-head, .task-detail__metric-row { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr)); }
.task-detail__metric-head { background: #f9fafb; color: #667085; font-size: 11px; padding: 8px 10px; }
.task-detail__metric-row { border-top: 1px solid #eaecf0; color: #475467; font-size: 12px; padding: 9px 10px; }
.task-detail__metric-row strong { color: #1d2939; font-weight: 600; }
.task-detail__metric-row small { color: #98a2b3; margin-left: 4px; }
.task-detail__review-result { color: #027a48; font-weight: 700; margin: 0 0 8px; }
.task-detail__sop { align-items: center; color: #667085; display: flex; font-size: 12px; gap: 7px; margin-top: 14px; }
@media (max-width: 640px) {
  .task-detail { gap: 20px; }
  .task-detail__overview { align-items: flex-start; flex-direction: column; gap: 8px; }
  .task-detail__updated { text-align: left; }
  .task-detail__evidence-grid { grid-template-columns: 1fr; }
}
</style>
