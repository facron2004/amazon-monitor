<script setup lang="ts">
import { computed } from "vue";
import { ElSegmented } from "element-plus";
import {
  CircleCheck,
  Clock3,
  Loader2,
  ShieldCheck,
  UsersRound,
} from "@lucide/vue";
import type {
  TaskTeamPerformanceMember,
  TaskTeamPerformanceResponse,
} from "@amazon-monitor/shared";

const props = defineProps<{
  performance: TaskTeamPerformanceResponse | null;
  days: 7 | 30 | 90;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "update:days": [value: 7 | 30 | 90];
  retry: [];
}>();

const rangeOptions = [
  { label: "近 7 天", value: 7 },
  { label: "近 30 天", value: 30 },
  { label: "近 90 天", value: 90 },
];

const daysModel = computed({
  get: () => props.days,
  set: (value: 7 | 30 | 90) => emit("update:days", value),
});

const summaryMetrics = computed(() => {
  const totals = props.performance?.totals;
  return [
    {
      label: `近 ${props.days} 天新增`,
      value: totals?.assignedCount ?? 0,
      icon: UsersRound,
      tone: "neutral",
    },
    {
      label: "当前待处理",
      value: totals?.openCount ?? 0,
      icon: Clock3,
      tone: "neutral",
    },
    {
      label: "已逾期",
      value: totals?.overdueCount ?? 0,
      icon: ShieldCheck,
      tone: totals?.overdueCount ? "danger" : "neutral",
    },
    {
      label: "复盘确认率",
      value: formatRate(
        totals?.confirmationRate ?? null,
        totals?.reviewedCount ?? 0,
      ),
      icon: CircleCheck,
      tone: "positive",
    },
  ];
});

function formatRate(value: number | null, sampleCount: number): string {
  return value === null ? "样本不足" : `${value}% · ${sampleCount} 单`;
}

function formatCycle(member: TaskTeamPerformanceMember): string {
  return member.averageCycleHours === null
    ? "—"
    : `${member.averageCycleHours} 小时`;
}
</script>

<template>
  <section class="team-performance" aria-labelledby="team-performance-title">
    <div class="team-performance__header">
      <div>
        <span>TEAM OPERATIONS</span>
        <h2 id="team-performance-title">团队效能</h2>
        <p>按任务创建批次统计完成与复盘，当前待办和逾期包含历史未关闭任务。</p>
      </div>
      <ElSegmented
        v-model="daysModel"
        :options="rangeOptions"
        aria-label="团队效能统计周期"
        size="small"
      />
    </div>

    <div v-if="loading && !performance" class="team-performance__state">
      <Loader2 :size="18" class="spinning" />
      <span>正在计算团队效能</span>
    </div>

    <div v-else-if="error && !performance" class="team-performance__state is-error">
      <span>{{ error }}</span>
      <button type="button" @click="emit('retry')">重试</button>
    </div>

    <template v-else-if="performance">
      <dl class="team-performance__summary">
        <div
          v-for="metric in summaryMetrics"
          :key="metric.label"
          :class="`is-${metric.tone}`"
        >
          <dt>
            <component :is="metric.icon" :size="14" />
            {{ metric.label }}
          </dt>
          <dd>{{ metric.value }}</dd>
        </div>
      </dl>

      <div class="team-performance__table-wrap">
        <table class="team-performance__table">
          <thead>
            <tr>
              <th>负责人</th>
              <th>新增</th>
              <th>完成</th>
              <th>待处理</th>
              <th>逾期</th>
              <th>按时完成</th>
              <th>复盘确认</th>
              <th>平均周期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in performance.members" :key="member.assigneeId ?? 'unassigned'">
              <th scope="row">
                <span class="team-performance__avatar">
                  {{ member.assigneeName.slice(0, 1).toUpperCase() }}
                </span>
                <span>{{ member.assigneeName }}</span>
              </th>
              <td>{{ member.assignedCount }}</td>
              <td>{{ member.completedCount }}</td>
              <td>{{ member.openCount }}</td>
              <td :class="{ 'is-overdue': member.overdueCount > 0 }">
                {{ member.overdueCount }}
              </td>
              <td>{{ formatRate(member.onTimeRate, member.dueCompletedCount) }}</td>
              <td>{{ formatRate(member.confirmationRate, member.reviewedCount) }}</td>
              <td>{{ formatCycle(member) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
