<script setup lang="ts">
import { computed } from "vue";
import { ElSegmented } from "element-plus";
import {
  Bot,
  CheckCheck,
  Loader2,
  MessageSquareMore,
  Workflow,
} from "@lucide/vue";
import type { AiQualityResponse } from "@amazon-monitor/shared";
import { agentLabels } from "./ai-agent-display";

const props = defineProps<{
  quality: AiQualityResponse | null;
  days: 7 | 30 | 90;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "update:days": [value: 7 | 30 | 90];
  retry: [];
}>();

const daysModel = computed({
  get: () => props.days,
  set: (value: 7 | 30 | 90) => emit("update:days", value),
});

const rangeOptions = [
  { label: "近 7 天", value: 7 },
  { label: "近 30 天", value: 30 },
  { label: "近 90 天", value: 90 },
];

const summary = computed(() => {
  const totals = props.quality?.totals;
  return [
    {
      label: "Agent 运行",
      value: totals?.runCount ?? 0,
      detail: `${totals?.successfulRunCount ?? 0} 次成功`,
      icon: Bot,
    },
    {
      label: "建议动作",
      value: totals?.actionCount ?? 0,
      detail: `${totals?.actionableRunCount ?? 0} 次运行含动作`,
      icon: Workflow,
    },
    {
      label: "团队好评率",
      value: formatRate(totals?.positiveFeedbackRate ?? null),
      detail: `${totals?.positiveFeedbackCount ?? 0} 赞 · ${totals?.negativeFeedbackCount ?? 0} 踩`,
      icon: MessageSquareMore,
    },
    {
      label: "复盘确认率",
      value: formatRate(totals?.taskConfirmationRate ?? null),
      detail: `${totals?.confirmedTaskCount ?? 0} 个确认有效`,
      icon: CheckCheck,
    },
  ];
});

function formatRate(rate: number | null): string {
  return rate === null ? "样本不足" : `${rate}%`;
}

function formatRateWithSample(rate: number | null, sample: number): string {
  return rate === null ? "样本不足" : `${rate}% · ${sample}`;
}
</script>

<template>
  <section class="agent-quality" aria-labelledby="agent-quality-title">
    <div class="agent-quality__header">
      <div>
        <span>QUALITY LOOP</span>
        <h2 id="agent-quality-title">建议质量与复盘证据</h2>
        <p>反馈按团队投票统计；转任务率按含建议的 Agent 运行计算，不冒充单条建议采纳率。</p>
      </div>
      <ElSegmented
        v-model="daysModel"
        :options="rangeOptions"
        aria-label="Agent 质量统计周期"
        size="small"
      />
    </div>

    <div v-if="loading && !quality" class="agent-quality__state">
      <Loader2 :size="18" class="spinning" />
      <span>正在汇总建议质量</span>
    </div>
    <div v-else-if="error && !quality" class="agent-quality__state is-error">
      <span>{{ error }}</span>
      <button type="button" @click="emit('retry')">重试</button>
    </div>

    <template v-else-if="quality">
      <dl class="agent-quality__summary">
        <div v-for="item in summary" :key="item.label">
          <dt><component :is="item.icon" :size="14" />{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
          <small>{{ item.detail }}</small>
        </div>
      </dl>

      <div v-if="quality.agents.length" class="agent-quality__table-wrap">
        <table class="agent-quality__table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>运行</th>
              <th>建议动作</th>
              <th>反馈票数</th>
              <th>好评率</th>
              <th>运行转任务</th>
              <th>任务复盘确认</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in quality.agents" :key="agent.agentType">
              <th scope="row">{{ agentLabels[agent.agentType] }}</th>
              <td>{{ agent.runCount }}</td>
              <td>{{ agent.actionCount }}</td>
              <td>{{ agent.feedbackCount }}</td>
              <td>{{ formatRateWithSample(agent.positiveFeedbackRate, agent.feedbackCount) }}</td>
              <td>{{ formatRateWithSample(agent.runConversionRate, agent.actionableRunCount) }}</td>
              <td>{{ formatRateWithSample(agent.taskConfirmationRate, agent.reviewedTaskCount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="agent-quality__empty">当前周期还没有 Agent 运行证据。</p>
    </template>
  </section>
</template>

<style scoped>
.agent-quality {
  border-bottom: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  display: grid;
  gap: 14px;
  padding: 16px 0;
}

.agent-quality__header {
  align-items: flex-start;
  display: flex;
  gap: 20px;
  justify-content: space-between;
}

.agent-quality__header > div {
  min-width: 0;
}

.agent-quality__header span {
  color: #8a8a93;
  font-size: 10px;
  font-weight: 700;
}

.agent-quality__header h2 {
  font-size: 16px;
  margin: 3px 0 0;
}

.agent-quality__header p {
  color: #6e6e73;
  font-size: 11px;
  line-height: 1.5;
  margin: 5px 0 0;
}

.agent-quality__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.agent-quality__summary > div {
  border-right: 1px solid var(--border-color);
  min-width: 0;
  padding: 4px 14px;
}

.agent-quality__summary > div:first-child {
  padding-left: 0;
}

.agent-quality__summary > div:last-child {
  border-right: 0;
}

.agent-quality__summary dt {
  align-items: center;
  color: #6e6e73;
  display: flex;
  font-size: 11px;
  gap: 5px;
}

.agent-quality__summary dd {
  color: #1d1d1f;
  font-size: 19px;
  font-weight: 700;
  margin: 5px 0 1px;
}

.agent-quality__summary small {
  color: #8a8a93;
  font-size: 10px;
}

.agent-quality__state,
.agent-quality__empty {
  color: #6e6e73;
  font-size: 12px;
  margin: 0;
  min-height: 80px;
}

.agent-quality__state {
  align-items: center;
  display: flex;
  gap: 7px;
  justify-content: center;
}

.agent-quality__state.is-error {
  color: #b42318;
}

.agent-quality__state button {
  background: transparent;
  border: 0;
  color: #0866d9;
  cursor: pointer;
  font-weight: 650;
}

.agent-quality__empty {
  align-items: center;
  display: flex;
  justify-content: center;
}

.agent-quality__table-wrap {
  min-width: 0;
  overflow-x: auto;
}

.agent-quality__table {
  border-collapse: collapse;
  min-width: 760px;
  table-layout: fixed;
  width: 100%;
}

.agent-quality__table th,
.agent-quality__table td {
  border-bottom: 1px solid #ececef;
  color: #3a3a3c;
  font-size: 11px;
  padding: 10px 8px;
  text-align: right;
}

.agent-quality__table thead th {
  color: #8a8a93;
  font-size: 10px;
  font-weight: 650;
}

.agent-quality__table th:first-child {
  text-align: left;
  width: 170px;
}

.agent-quality__table tbody th {
  font-weight: 650;
}

.agent-quality__table tbody tr:last-child th,
.agent-quality__table tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .agent-quality__header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .agent-quality__header :deep(.el-segmented) {
    width: 100%;
  }

  .agent-quality__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .agent-quality__summary > div {
    border-bottom: 1px solid var(--border-color);
    padding: 10px;
  }

  .agent-quality__summary > div:nth-child(2n) {
    border-right: 0;
  }

  .agent-quality__summary > div:first-child {
    padding-left: 10px;
  }

  .agent-quality__summary > div:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
}
</style>
