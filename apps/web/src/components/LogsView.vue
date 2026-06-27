<script setup lang="ts">
import { computed } from "vue";
import type { CollectJob, CollectTaskLog } from "@amazon-monitor/shared";
import { formatLocalDateTime, statusText } from "../utils/formatters";

interface Props {
  logs: CollectTaskLog[];
  jobs: CollectJob[];
}

const props = defineProps<Props>();

const jobRows = computed(() =>
  [...props.jobs].sort((a, b) => b.id - a.id).map((job) => {
    const startedAt = job.startedAt ? formatLocalDateTime(job.startedAt) : "-";
    const completedAt = job.completedAt ? formatLocalDateTime(job.completedAt) : "-";
    const queuedAt = formatLocalDateTime(job.createdAt);

    let durationLabel = "-";
    if (job.startedAt) {
      const endMs = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
      const ms = Math.max(0, endMs - new Date(job.startedAt).getTime());
      if (ms < 1000) {
        durationLabel = `${ms}ms`;
      } else if (ms < 60_000) {
        durationLabel = `${(ms / 1000).toFixed(1)}s`;
      } else {
        durationLabel = `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
      }
    }

    return {
      id: job.id,
      taskType: job.taskType,
      targetId: job.targetId,
      date: job.date,
      status: job.status,
      queuedAt,
      startedAt,
      completedAt,
      durationLabel,
      retryCount: job.retryCount,
      errorMessage: job.errorMessage
    };
  })
);
</script>

<template>
  <section class="view panel">
    <div class="panel-head">
      <h2>采集任务执行记录</h2>
      <span>{{ jobRows.length }} 条任务 / {{ logs.length }} 条子记录</span>
    </div>

    <div v-if="jobRows.length === 0" class="empty-state">
      <p>暂无任务记录。点击侧栏的"采集"按钮开始首次数据采集。</p>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>入队时间</th>
            <th>开始时间</th>
            <th>完成时间</th>
            <th>耗时</th>
            <th>类型</th>
            <th>目标 ID</th>
            <th>日期</th>
            <th>状态</th>
            <th>重试</th>
            <th>错误信息</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in jobRows" :key="job.id">
            <td>{{ job.queuedAt }}</td>
            <td>{{ job.startedAt }}</td>
            <td>{{ job.completedAt }}</td>
            <td>{{ job.durationLabel }}</td>
            <td>{{ job.taskType }}</td>
            <td>{{ job.targetId }}</td>
            <td>{{ job.date }}</td>
            <td>
              <span :class="['status-pill', `status-${job.status}`]">{{ statusText(job.status) }}</span>
            </td>
            <td>{{ job.retryCount }}</td>
            <td class="error-cell">{{ job.errorMessage || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="view panel">
    <div class="panel-head">
      <h2>采集运行日志（子任务）</h2>
      <span>{{ logs.length }} 条</span>
    </div>
    <div v-if="logs.length === 0" class="empty-state">
      <p>暂无子任务记录。</p>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>开始时间</th>
            <th>关键词</th>
            <th>状态</th>
            <th>页数</th>
            <th>成功</th>
            <th>失败</th>
            <th>错误</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ formatLocalDateTime(log.startTime) }}</td>
            <td>{{ log.keyword }}</td>
            <td>{{ statusText(log.status) }}</td>
            <td>{{ log.pageCount }}</td>
            <td>{{ log.successCount }}</td>
            <td>{{ log.failCount }}</td>
            <td class="error-cell">{{ log.errorMessage || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.status-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.status-pending {
  background: rgba(120, 120, 120, 0.18);
  color: #555;
}

.status-processing {
  background: rgba(56, 132, 255, 0.18);
  color: #1f5fd1;
}

.status-completed {
  background: rgba(40, 167, 69, 0.18);
  color: #1f7a3a;
}

.status-success {
  background: rgba(40, 167, 69, 0.18);
  color: #1f7a3a;
}

.status-failed {
  background: rgba(220, 53, 69, 0.18);
  color: #b3243b;
}

.error-cell {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
