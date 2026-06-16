<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import { categoryLabel, qualityStatusLabel } from "../utils/formatters";

const store = useCategoryStore();
const { badBsrQuality, bsrQuality } = storeToRefs(store);
</script>

<template>
  <section id="category-quality" class="panel dense-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>BSR 快照质量</h2>
        <p class="panel-caption">优先查看部分缺失和空数据，避免基于不完整榜单做误判。</p>
      </div>
      <span>{{ badBsrQuality.length ? `${badBsrQuality.length} 条待复核` : "当前质量正常" }}</span>
    </div>
    <div class="table-wrap compact-scroll bsr-small-scroll">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>状态</th>
            <th>类目</th>
            <th>行数</th>
            <th>唯一排名数</th>
            <th>排名范围</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in bsrQuality" :key="`${item.snapshotDate}-${item.sourceType}-${item.sourceId}-${item.category}`">
            <td>{{ item.snapshotDate }}</td>
            <td><span :class="['level', item.qualityStatus]">{{ qualityStatusLabel(item.qualityStatus) }}</span></td>
            <td>{{ categoryLabel(item.category) }}</td>
            <td>{{ item.actualCount }} / {{ item.expectedCount || "-" }}</td>
            <td>{{ item.uniqueRankCount }} / {{ item.expectedCount || "-" }}</td>
            <td>#{{ item.minRank || "-" }} - #{{ item.maxRank || "-" }}</td>
            <td class="target-cell">{{ item.issue || "未记录问题" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
