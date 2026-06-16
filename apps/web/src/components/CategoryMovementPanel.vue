<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import { categoryLabel, changeLabel } from "../utils/formatters";

const store = useCategoryStore();
const { bsrRankChanges } = storeToRefs(store);
</script>

<template>
  <section id="category-movement" class="panel dense-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>榜单波动</h2>
        <p class="panel-caption">聚焦进入、掉出和大幅升降的商品，快速判断今天的榜单变化主线。</p>
      </div>
      <span>{{ bsrRankChanges.length }} 条事件</span>
    </div>
    <div class="table-wrap compact-scroll bsr-change-scroll">
      <table>
        <thead>
          <tr>
            <th>变化</th>
            <th>类目</th>
            <th>ASIN</th>
            <th>商品</th>
            <th>当前排名</th>
            <th>上次排名</th>
            <th>变化值</th>
            <th>打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in bsrRankChanges" :key="`${item.sourceType}-${item.category}-${item.asin}-${item.changeType}`">
            <td>{{ changeLabel(item.changeType) }}</td>
            <td>{{ categoryLabel(item.category) }}</td>
            <td><strong>{{ item.asin }}</strong></td>
            <td class="target-cell">{{ item.title }}</td>
            <td>{{ item.currentRank ? `#${item.currentRank}` : "-" }}</td>
            <td>{{ item.previousRank ? `#${item.previousRank}` : "-" }}</td>
            <td>{{ item.rankChange === null ? "-" : item.rankChange > 0 ? `+${item.rankChange}` : item.rankChange }}</td>
            <td>
              <a v-if="item.productUrl" :href="item.productUrl" target="_blank" rel="noreferrer">
                <ExternalLink :size="16" />
              </a>
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
