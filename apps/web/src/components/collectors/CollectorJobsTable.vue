<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ElButton, ElInput, ElOption, ElSelect } from "element-plus";
import { FilterX, Search } from "@lucide/vue";
import { useCollectorsStore } from "../../stores/collectors";
import { formatLocalDateTime } from "../../utils/formatters";
import {
  collectorJobStatusLabels,
  collectorTaskTypeLabels,
  formatCollectorDuration
} from "./collector-display";

const store = useCollectorsStore();
const { filteredJobs, jobs, taskTypeFilter, statusFilter, sort, query, loading } = storeToRefs(store);
</script>

<template>
  <section class="panel collector-table-panel">
    <header class="collector-section-head collector-table-head">
      <div>
        <p class="eyebrow">Queue</p>
        <h3>任务队列</h3>
      </div>
      <div class="collector-filters">
        <ElInput v-model="query" clearable placeholder="任务 ID、目标或错误" class="collector-search">
          <template #prefix><Search :size="14" /></template>
        </ElInput>
        <ElSelect v-model="taskTypeFilter" aria-label="采集类型" class="collector-filter-select">
          <ElOption label="全部类型" value="all" />
          <ElOption label="关键词" value="keyword" />
          <ElOption label="类目榜单" value="category" />
        </ElSelect>
        <ElSelect v-model="statusFilter" aria-label="任务状态" class="collector-filter-select">
          <ElOption label="全部状态" value="all" />
          <ElOption label="等待中" value="pending" />
          <ElOption label="采集中" value="processing" />
          <ElOption label="已完成" value="completed" />
          <ElOption label="失败" value="failed" />
        </ElSelect>
        <ElSelect v-model="sort" aria-label="排序方式" class="collector-filter-select">
          <ElOption label="最新入队" value="newest" />
          <ElOption label="最早入队" value="oldest" />
          <ElOption label="失败优先" value="failures" />
        </ElSelect>
        <ElButton title="清除筛选" aria-label="清除筛选" @click="store.clearFilters"><FilterX :size="15" /></ElButton>
      </div>
    </header>

    <div v-if="filteredJobs.length" class="table-wrap collector-table-wrap">
      <table>
        <thead>
          <tr>
            <th>任务</th><th>类型</th><th>目标</th><th>业务日期</th><th>入队时间</th><th>耗时</th><th>重试</th><th>状态</th><th>异常原因</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in filteredJobs" :key="job.id">
            <td class="collector-sticky-cell"><strong>#{{ job.id }}</strong></td>
            <td>{{ collectorTaskTypeLabels[job.taskType] }}</td>
            <td>#{{ job.targetId }}</td>
            <td>{{ job.date }}</td>
            <td>{{ formatLocalDateTime(job.createdAt) }}</td>
            <td>{{ formatCollectorDuration(job.startedAt, job.completedAt) }}</td>
            <td>{{ job.retryCount }}</td>
            <td><span :class="['collector-status', `is-${job.status}`]">{{ collectorJobStatusLabels[job.status] }}</span></td>
            <td class="collector-error-cell"><span :title="job.errorMessage ?? undefined">{{ job.errorMessage || "-" }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state collector-empty-state">
      <p>{{ loading ? "正在读取任务队列..." : jobs.length ? "没有符合当前筛选的任务，请调整筛选条件。" : "暂无任务。选择采集范围并点击运行即可创建第一批任务。" }}</p>
    </div>
  </section>
</template>
