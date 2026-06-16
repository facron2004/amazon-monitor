<script setup lang="ts">
import type { CollectTaskLog } from "@amazon-monitor/shared";
import { statusText } from "../utils/formatters";

interface Props {
  logs: CollectTaskLog[];
}

defineProps<Props>();
</script>

<template>
  <section class="view panel">
    <div class="panel-head">
      <h2>采集运行日志</h2>
      <span>{{ logs.length }} 条</span>
    </div>
    <div v-if="logs.length === 0" class="empty-state">
      <p>暂无采集记录。点击侧栏的"采集"按钮开始首次数据采集。</p>
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
            <td>{{ log.startTime.slice(0, 19).replace("T", " ") }}</td>
            <td>{{ log.keyword }}</td>
            <td>{{ statusText(log.status) }}</td>
            <td>{{ log.pageCount }}</td>
            <td>{{ log.successCount }}</td>
            <td>{{ log.failCount }}</td>
            <td>{{ log.errorMessage || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
