<script setup lang="ts">
import { ElEmpty, ElProgress, ElTag } from "element-plus";
import { CalendarClock, CircleAlert, CircleCheck, CirclePause, Gauge, RefreshCw, Target } from "@lucide/vue";
import { computed } from "vue";
import {
  clampProgress,
  constraintTagType,
  formatAgentOsDate,
  formatProgressPercent,
  goalProgressStatus,
  goalStatusLabel,
  goalStatusTagType,
  resolveAgentOsViewState
} from "./agent-os-formatters";
import type { GoalConstraint, GoalSummary } from "./agent-os-types";

const props = withDefaults(defineProps<{
  goal: GoalSummary | null;
  loading?: boolean;
  error?: string | null;
}>(), {
  loading: false,
  error: null
});

const emit = defineEmits<{
  retry: [];
}>();

const state = computed(() => resolveAgentOsViewState(
  props.loading,
  props.error,
  props.goal !== null
));

function constraintKey(constraint: GoalConstraint): string {
  return constraint.id ?? `${constraint.label}:${constraint.value}`;
}

function statusIcon(status: GoalSummary["status"]): typeof CircleCheck {
  if (status === "completed" || status === "on_track") return CircleCheck;
  if (status === "paused") return CirclePause;
  return CircleAlert;
}
</script>

<template>
  <article class="agent-os-goal-card" :aria-busy="state === 'loading'">
    <div v-if="state === 'loading'" class="agent-os-state agent-os-state--loading" role="status" aria-live="polite">
      <div class="agent-os-skeleton agent-os-skeleton--title" aria-hidden="true" />
      <div class="agent-os-skeleton agent-os-skeleton--metric" aria-hidden="true" />
      <div class="agent-os-skeleton agent-os-skeleton--line" aria-hidden="true" />
      <span>正在加载目标状态...</span>
    </div>

    <div v-else-if="state === 'failed'" class="agent-os-state agent-os-state--failed" role="alert">
      <span class="agent-os-state__icon" aria-hidden="true"><CircleAlert :size="20" /></span>
      <div class="agent-os-state__copy">
        <strong>目标状态加载失败</strong>
        <span>{{ error || "暂时无法读取目标数据，请稍后重试。" }}</span>
      </div>
      <button
        type="button"
        class="agent-os-state__retry"
        aria-label="重新加载目标状态"
        @click="emit('retry')"
      >
        <RefreshCw :size="14" aria-hidden="true" />
        <span>重试</span>
      </button>
    </div>

    <ElEmpty
      v-else-if="state === 'empty'"
      class="agent-os-empty"
      description="暂无目标，创建一个 Goal 后即可开始追踪。"
      :image-size="72"
    />

    <template v-else-if="goal">
      <header class="agent-os-goal-card__header">
        <div class="agent-os-goal-card__identity">
          <span class="agent-os-eyebrow"><Target :size="13" aria-hidden="true" /> Goal Center</span>
          <h3>{{ goal.title }}</h3>
          <p v-if="goal.description">{{ goal.description }}</p>
        </div>
        <ElTag :type="goalStatusTagType(goal.status)" effect="light">
          <component :is="statusIcon(goal.status)" :size="13" aria-hidden="true" />
          {{ goalStatusLabel(goal.status) }}
        </ElTag>
      </header>

      <dl class="agent-os-goal-facts">
        <div>
          <dt>指标</dt>
          <dd>{{ goal.metric }}</dd>
        </div>
        <div>
          <dt>当前值</dt>
          <dd>{{ goal.currentValue }}</dd>
        </div>
        <div>
          <dt>目标值</dt>
          <dd>{{ goal.targetValue }}</dd>
        </div>
        <div>
          <dt><CalendarClock :size="13" aria-hidden="true" /> 截止时间</dt>
          <dd>{{ formatAgentOsDate(goal.deadline) }}</dd>
        </div>
      </dl>

      <section class="agent-os-goal-progress" aria-label="目标进度">
        <div class="agent-os-section-heading">
          <span><Gauge :size="14" aria-hidden="true" /> 完成进度</span>
          <strong>{{ formatProgressPercent(goal.progress) }}</strong>
        </div>
        <ElProgress
          :percentage="clampProgress(goal.progress)"
          :status="goalProgressStatus(goal.status)"
          :show-text="false"
          :stroke-width="8"
        />
      </section>

      <section v-if="goal.constraints.length" class="agent-os-constraints" aria-labelledby="agent-os-constraints-title">
        <div class="agent-os-section-heading">
          <h4 id="agent-os-constraints-title">约束条件</h4>
          <span>{{ goal.constraints.length }} 项</span>
        </div>
        <ul>
          <li v-for="constraint in goal.constraints" :key="constraintKey(constraint)">
            <span>{{ constraint.label }}</span>
            <ElTag :type="constraintTagType(constraint.tone)" size="small" effect="plain">
              {{ constraint.value }}
            </ElTag>
          </li>
        </ul>
      </section>
    </template>
  </article>
</template>

<style scoped>
.agent-os-goal-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  min-width: 0;
  padding: 18px;
}

.agent-os-goal-card__header,
.agent-os-section-heading,
.agent-os-eyebrow,
.agent-os-goal-card__header :deep(.el-tag),
.agent-os-goal-facts dt {
  align-items: center;
  display: flex;
}

.agent-os-goal-card__header {
  gap: 14px;
  justify-content: space-between;
}

.agent-os-goal-card__identity {
  min-width: 0;
}

.agent-os-eyebrow {
  color: #2563eb;
  font-size: 11px;
  font-weight: 750;
  gap: 5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-os-goal-card h3 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.3;
  margin: 6px 0 0;
}

.agent-os-goal-card__identity p {
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  margin: 5px 0 0;
}

.agent-os-goal-card__header :deep(.el-tag) {
  flex: 0 0 auto;
  gap: 5px;
}

.agent-os-goal-facts {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 18px 0;
}

.agent-os-goal-facts div {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 10px;
}

.agent-os-goal-facts dt {
  color: #64748b;
  font-size: 11px;
  gap: 4px;
  line-height: 1.4;
}

.agent-os-goal-facts dd {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  margin: 5px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-os-goal-progress,
.agent-os-constraints {
  border-top: 1px solid #e2e8f0;
  padding-top: 14px;
}

.agent-os-section-heading {
  color: #475569;
  font-size: 12px;
  justify-content: space-between;
  margin-bottom: 9px;
}

.agent-os-section-heading span:first-child,
.agent-os-section-heading h4 {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

.agent-os-section-heading strong {
  color: #0f172a;
  font-size: 14px;
}

.agent-os-section-heading h4 {
  color: #0f172a;
  font-size: 13px;
  margin: 0;
}

.agent-os-goal-progress :deep(.el-progress-bar__outer) {
  background: #eaf0f8;
}

.agent-os-constraints {
  margin-top: 14px;
}

.agent-os-constraints ul {
  display: grid;
  gap: 7px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.agent-os-constraints li {
  align-items: center;
  color: #475569;
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
}

.agent-os-constraints li > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-os-state {
  align-items: center;
  border-radius: 9px;
  display: flex;
  gap: 10px;
  min-height: 112px;
}

.agent-os-state--loading {
  flex-wrap: wrap;
}

.agent-os-state--loading > span {
  color: #64748b;
  flex-basis: 100%;
  font-size: 12px;
}

.agent-os-skeleton {
  animation: agent-os-pulse 1.3s ease-in-out infinite;
  background: #e2e8f0;
  border-radius: 5px;
}

.agent-os-skeleton--title {
  height: 22px;
  width: 42%;
}

.agent-os-skeleton--metric {
  height: 54px;
  width: 100%;
}

.agent-os-skeleton--line {
  height: 9px;
  width: 68%;
}

.agent-os-state--failed {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  padding: 12px;
}

.agent-os-state__icon {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
}

.agent-os-state__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.agent-os-state__copy strong {
  color: #7c2d12;
  font-size: 13px;
}

.agent-os-state__copy span {
  color: #9a3412;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.agent-os-state__retry {
  align-items: center;
  background: #ffffff;
  border: 1px solid #fdba74;
  border-radius: 7px;
  color: #9a3412;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  gap: 5px;
  margin-left: auto;
  min-height: 34px;
  padding: 0 11px;
}

.agent-os-state__retry:hover {
  background: #fffaf5;
}

.agent-os-state__retry:focus-visible,
.agent-os-goal-card :deep(button:focus-visible) {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.agent-os-empty {
  min-height: 112px;
}

@keyframes agent-os-pulse {
  0%,
  100% { opacity: 0.52; }
  50% { opacity: 1; }
}

@media (max-width: 760px) {
  .agent-os-goal-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .agent-os-goal-card__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .agent-os-state--failed {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .agent-os-state__retry {
    margin-left: 30px;
  }
}
</style>
