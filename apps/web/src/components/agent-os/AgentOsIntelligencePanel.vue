<script setup lang="ts">
import { computed } from "vue";
import { ElEmpty, ElTag } from "element-plus";
import {
  Beaker,
  CheckCircle2,
  CircleAlert,
  Database,
  GitBranch,
  Lightbulb,
  ShieldCheck,
} from "@lucide/vue";
import type {
  AgentOsDataQualityEvidence,
  AgentOsDecision,
  AgentOsExperiment,
  AgentOsOpportunity,
} from "../../api-agent-os";

const props = withDefaults(defineProps<{
  opportunities: AgentOsOpportunity[];
  decisions: AgentOsDecision[];
  experiments: AgentOsExperiment[];
  dataQuality: AgentOsDataQualityEvidence | null;
  loading?: boolean;
  error?: string | null;
  dataQualityError?: string | null;
}>(), {
  loading: false,
  error: null,
  dataQualityError: null,
});

const qualityReport = computed(() => props.dataQuality?.report ?? null);
const hasIntelligence = computed(() => props.opportunities.length > 0
  || props.decisions.length > 0
  || props.experiments.length > 0);

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function confidenceLabel(value: number | null): string {
  return value === null ? "未评估" : `${Math.round(value * 100)}%`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    IDENTIFIED: "已识别",
    VALIDATING: "验证中",
    READY: "待采纳",
    ACCEPTED: "已采纳",
    REJECTED: "已拒绝",
    EXPIRED: "已过期",
    ARCHIVED: "已归档",
    PROPOSED: "待评审",
    REVIEWING: "评审中",
    APPROVED: "已批准",
    EXECUTING: "执行中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    DRAFT: "草稿",
    RUNNING: "运行中",
    OBSERVING: "观察中",
    FAILED: "失败",
  };
  return labels[status] ?? status;
}

function statusType(status: string): "success" | "warning" | "danger" | "info" {
  if (["ACCEPTED", "APPROVED", "COMPLETED"].includes(status)) return "success";
  if (["VALIDATING", "READY", "REVIEWING", "EXECUTING", "RUNNING", "OBSERVING"].includes(status)) return "warning";
  if (["REJECTED", "EXPIRED", "FAILED", "CANCELLED"].includes(status)) return "danger";
  return "info";
}

function qualityType(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "TRUSTED") return "success";
  if (status === "PARTIAL" || status === "STALE") return "warning";
  return "danger";
}

function qualityLabel(status: string): string {
  return ({ TRUSTED: "可信", PARTIAL: "部分可信", STALE: "已过期", INVALID: "不可用" } as Record<string, string>)[status] ?? status;
}

function checkStatusLabel(status: string | undefined): string {
  return ({ success: "成功", partial: "部分完成", running: "运行中", failed: "失败", missing: "缺失" } as Record<string, string>)[status ?? ""] ?? "未记录";
}

function checkType(status: string | undefined): "success" | "warning" | "danger" | "info" {
  if (status === "success") return "success";
  if (status === "partial" || status === "running") return "warning";
  if (status === "failed" || status === "missing") return "danger";
  return "info";
}
</script>

<template>
  <section class="agent-os-intelligence panel" aria-label="Agent OS 智能闭环">
    <header class="agent-os-intelligence__header">
      <div>
        <p class="eyebrow"><GitBranch :size="14" /> Intelligence Loop</p>
        <h3>机会 → 决策 → 实验</h3>
        <p>以下内容全部来自 Agent OS Intelligence API；没有数据时保持空态。</p>
      </div>
      <div class="agent-os-intelligence__counts">
        <ElTag size="small" effect="plain">机会 {{ opportunities.length }}</ElTag>
        <ElTag size="small" effect="plain">决策 {{ decisions.length }}</ElTag>
        <ElTag size="small" effect="plain">实验 {{ experiments.length }}</ElTag>
      </div>
    </header>

    <div v-if="loading" class="agent-os-intelligence__loading" role="status" aria-live="polite">
      正在读取机会、决策、实验和数据质量证据...
    </div>

    <p v-if="error" class="agent-os-intelligence__error" role="alert">
      <CircleAlert :size="15" /> {{ error }}
    </p>

    <div v-if="!loading" class="agent-os-intelligence__columns">
      <article class="agent-os-intelligence__column">
        <header><Lightbulb :size="15" /><h4>机会</h4></header>
        <ul v-if="opportunities.length" class="agent-os-intelligence__list">
          <li v-for="opportunity in opportunities.slice(0, 5)" :key="opportunity.id">
            <div class="agent-os-intelligence__item-head">
              <strong>{{ opportunity.title }}</strong>
              <ElTag size="small" effect="light" :type="statusType(opportunity.status)">
                {{ statusLabel(opportunity.status) }}
              </ElTag>
            </div>
            <p>{{ opportunity.summary || displayValue(opportunity.details) }}</p>
            <small>类型 {{ opportunity.type }} · 置信度 {{ confidenceLabel(opportunity.confidence) }}</small>
            <small v-if="opportunity.score !== null">评分 {{ opportunity.score }}</small>
          </li>
        </ul>
        <ElEmpty v-else :image-size="42" description="暂无机会记录" />
      </article>

      <article class="agent-os-intelligence__column">
        <header><ShieldCheck :size="15" /><h4>决策</h4></header>
        <ul v-if="decisions.length" class="agent-os-intelligence__list">
          <li v-for="decision in decisions.slice(0, 5)" :key="decision.id">
            <div class="agent-os-intelligence__item-head">
              <strong>{{ decision.issue }}</strong>
              <ElTag size="small" effect="light" :type="statusType(decision.status)">
                {{ statusLabel(decision.status) }}
              </ElTag>
            </div>
            <p>推荐方案：{{ displayValue(decision.recommendedOption) }}</p>
            <small>置信度 {{ confidenceLabel(decision.confidence) }} · {{ decision.requiredApproval ? "需要审批" : "无需额外审批" }}</small>
            <small v-if="decision.sourceOpportunityId !== null">来源机会 #{{ decision.sourceOpportunityId }}</small>
          </li>
        </ul>
        <ElEmpty v-else :image-size="42" description="暂无决策记录" />
      </article>

      <article class="agent-os-intelligence__column">
        <header><Beaker :size="15" /><h4>实验</h4></header>
        <ul v-if="experiments.length" class="agent-os-intelligence__list">
          <li v-for="experiment in experiments.slice(0, 5)" :key="experiment.id">
            <div class="agent-os-intelligence__item-head">
              <strong>{{ experiment.title }}</strong>
              <ElTag size="small" effect="light" :type="statusType(experiment.status)">
                {{ statusLabel(experiment.status) }}
              </ElTag>
            </div>
            <p>假设：{{ displayValue(experiment.hypothesis) }}</p>
            <small>置信度 {{ confidenceLabel(experiment.confidence) }} · 观察 {{ experiment.observationWindowDays ?? "未设置" }} 天</small>
            <small v-if="experiment.attribution">归因 {{ experiment.attribution }}</small>
          </li>
        </ul>
        <ElEmpty v-else :image-size="42" description="暂无实验记录" />
      </article>
    </div>

    <section class="agent-os-quality">
      <header>
        <div><p class="eyebrow"><Database :size="13" /> Evidence Gate</p><h4>数据质量</h4></div>
        <ElTag v-if="qualityReport" size="small" effect="light" :type="qualityType(qualityReport.status)">
          {{ qualityLabel(qualityReport.status) }}
        </ElTag>
      </header>
      <p v-if="dataQualityError" class="agent-os-intelligence__error" role="alert">
        <CircleAlert :size="15" /> {{ dataQualityError }}
      </p>
      <template v-else-if="dataQuality">
        <div class="agent-os-quality__facts">
          <span>质量分 {{ qualityReport ? Math.round(qualityReport.score * 100) : 0 }}%</span>
          <span>门禁 {{ dataQuality.evidenceGate.allowed ? "允许分析" : dataQuality.evidenceGate.action }}</span>
          <span>检查 {{ dataQuality.sourceChecks.length }} 个来源</span>
          <span>检查时间 {{ dataQuality.checkedAt }}</span>
        </div>
        <p class="agent-os-quality__reason">{{ dataQuality.evidenceGate.reason }}</p>
        <ul v-if="dataQuality.sourceChecks.length" class="agent-os-quality__sources">
          <li v-for="check in dataQuality.sourceChecks.slice(0, 6)" :key="check.source">
            <span>{{ check.source }}</span>
            <ElTag size="small" effect="plain" :type="checkType(check.collectionStatus)">
              {{ checkStatusLabel(check.collectionStatus) }}
            </ElTag>
            <small>{{ check.completeness === null || check.completeness === undefined ? "完整度未记录" : `完整度 ${Math.round(check.completeness * 100)}%` }}</small>
          </li>
        </ul>
        <p v-if="qualityReport?.warnings.length" class="agent-os-quality__warnings">
          {{ qualityReport.warnings.length }} 条质量警告：{{ qualityReport.warnings.slice(0, 2).join("；") }}
        </p>
      </template>
      <p v-else class="agent-os-muted">暂无数据质量证据。</p>
    </section>

    <p v-if="!hasIntelligence && !dataQuality && !loading && !error && !dataQualityError" class="agent-os-muted">
      Agent OS 尚未返回机会、决策、实验或数据质量记录。
    </p>
  </section>
</template>

<style scoped>
.agent-os-intelligence {
  display: grid;
  gap: 16px;
  padding: 18px;
}
.agent-os-intelligence__header,
.agent-os-intelligence__counts,
.agent-os-intelligence__item-head,
.agent-os-quality > header,
.agent-os-quality__facts,
.agent-os-quality__sources li,
.agent-os-intelligence__error,
.agent-os-intelligence__loading { align-items: center; display: flex; }
.agent-os-intelligence__header,
.agent-os-quality > header { gap: 14px; justify-content: space-between; }
.agent-os-intelligence__header h3,
.agent-os-quality h4 { margin: 3px 0 0; }
.agent-os-intelligence__header > div:first-child > p:last-child { color: #64748b; font-size: 12px; margin: 6px 0 0; }
.agent-os-intelligence__counts { flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.agent-os-intelligence__columns { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.agent-os-intelligence__column { border: 1px solid #e2e8f0; border-radius: 9px; min-width: 0; padding: 12px; }
.agent-os-intelligence__column > header { align-items: center; color: #1d4ed8; display: flex; gap: 6px; }
.agent-os-intelligence__column h4 { color: #0f172a; margin: 0; }
.agent-os-intelligence__list { display: grid; gap: 9px; list-style: none; margin: 12px 0 0; padding: 0; }
.agent-os-intelligence__list li { border-top: 1px solid #edf2f7; display: grid; gap: 5px; min-width: 0; padding-top: 9px; }
.agent-os-intelligence__item-head { align-items: flex-start; gap: 7px; justify-content: space-between; }
.agent-os-intelligence__item-head strong { color: #0f172a; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.agent-os-intelligence__list p { color: #475569; font-size: 12px; line-height: 1.45; margin: 0; overflow-wrap: anywhere; }
.agent-os-intelligence__list small,
.agent-os-quality__facts,
.agent-os-quality__sources small { color: #64748b; font-size: 11px; }
.agent-os-intelligence__loading,
.agent-os-intelligence__error { color: #64748b; font-size: 12px; gap: 6px; }
.agent-os-intelligence__error { color: #b45309; margin: 0; }
.agent-os-quality { border-top: 1px solid #e2e8f0; padding-top: 16px; }
.agent-os-quality__facts { flex-wrap: wrap; gap: 8px 16px; margin-top: 10px; }
.agent-os-quality__reason { color: #475569; font-size: 12px; margin: 8px 0 0; }
.agent-os-quality__sources { display: grid; gap: 7px; list-style: none; margin: 12px 0 0; padding: 0; }
.agent-os-quality__sources li { border-top: 1px solid #edf2f7; gap: 8px; padding-top: 7px; }
.agent-os-quality__sources li > span { color: #334155; flex: 1 1 auto; font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
.agent-os-quality__warnings { color: #b45309; font-size: 11px; line-height: 1.45; margin: 10px 0 0; }
.agent-os-muted { color: #64748b; font-size: 12px; margin: 0; }
@media (max-width: 980px) { .agent-os-intelligence__columns { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .agent-os-intelligence__header,
  .agent-os-quality > header { align-items: flex-start; flex-direction: column; }
  .agent-os-intelligence__counts { justify-content: flex-start; }
}
</style>
