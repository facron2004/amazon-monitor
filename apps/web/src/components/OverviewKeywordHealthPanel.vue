<script setup lang="ts">
import type { KeywordMonitor } from "@amazon-monitor/shared";
import { statusText } from "../utils/formatters";

interface Props {
  keywords: KeywordMonitor[];
}

interface Emits {
  (e: "select-keyword", keywordId: number): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="panel keyword-panel">
    <div class="panel-head panel-head-split">
      <div>
        <h2>关键词监控健康度</h2>
        <span>{{ keywords.length }} 个关键词</span>
      </div>
      <p class="panel-caption">把健康度列表改成稳定的信息块，让状态扫描更快，也更适合横向对比。</p>
    </div>
    <div class="table-wrap keyword-table-wrap">
      <table>
        <thead>
          <tr>
            <th>关键词</th>
            <th>站点</th>
            <th>页数</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="keyword in keywords" :key="keyword.id" @click="emit('select-keyword', keyword.id)">
            <td>{{ keyword.keyword }}</td>
            <td>{{ keyword.marketplace }}</td>
            <td>{{ keyword.crawlPages }}</td>
            <td>
              <span :class="['status-dot', keyword.todayStatus]">{{ statusText(keyword.todayStatus) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
