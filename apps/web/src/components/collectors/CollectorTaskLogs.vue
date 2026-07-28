<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ElPagination } from "element-plus";
import { useCollectorsStore } from "../../stores/collectors";
import { formatLocalDateTime, statusText } from "../../utils/formatters";

const store = useCollectorsStore();
const { logs, logsTotal, logsLimit, logsCurrentPage, loading, logsLoading } = storeToRefs(store);
</script>

<template>
  <section class="panel collector-table-panel">
    <header class="collector-section-head">
      <div>
        <p class="eyebrow">Execution</p>
        <h3>执行明细</h3>
      </div>
      <span>第 {{ logsCurrentPage }} 页 · 共 {{ logsTotal }} 条执行明细</span>
    </header>
    <div v-if="logs.length" class="table-wrap collector-table-wrap">
      <table>
        <thead>
          <tr><th>开始时间</th><th>关键词</th><th>站点</th><th>状态</th><th>页数</th><th>成功</th><th>失败</th><th>重试</th><th>错误</th></tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ formatLocalDateTime(log.startTime) }}</td>
            <td><strong>{{ log.keyword || "-" }}</strong></td>
            <td>{{ log.marketplace || "-" }}</td>
            <td><span :class="['collector-status', `is-${log.status}`]">{{ statusText(log.status) }}</span></td>
            <td>{{ log.pageCount }}</td><td>{{ log.successCount }}</td><td>{{ log.failCount }}</td><td>{{ log.retryCount }}</td>
            <td class="collector-error-cell"><span :title="log.errorMessage ?? undefined">{{ log.errorMessage || "-" }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state collector-empty-state">
      <p>{{ loading ? "正在读取执行明细..." : "暂无执行明细。Worker 完成关键词采集后会在这里留下页面、成功数和错误证据。" }}</p>
    </div>
    <footer v-if="logsTotal > 0" class="collector-log-pagination">
      <span>当前显示 {{ logs.length }} 条</span>
      <ElPagination
        size="small"
        background
        layout="prev, pager, next"
        :current-page="logsCurrentPage"
        :page-size="logsLimit"
        :total="logsTotal"
        :disabled="logsLoading"
        @current-change="store.goToLogsPage"
      />
    </footer>
  </section>
</template>
