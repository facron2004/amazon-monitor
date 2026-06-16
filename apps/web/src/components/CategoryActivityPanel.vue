<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { storeToRefs } from "pinia";
import type { CompetitorActivityEvent } from "@amazon-monitor/shared";
import type { ActivityEventFilter } from "../types/category-activity";
import { useCategoryStore } from "../stores/category";
import { openCategoryProductByAsin } from "../utils/open-category-product";
import { changeLabel, formatCount, formatMoney, formatSignedCount, levelLabel, localizeGeneratedText } from "../utils/formatters";

const store = useCategoryStore();
const { filteredActivityEvents, activityEvents, activityEventFilter, activityEventOptions } = storeToRefs(store);

function handleOpenProduct(item: CompetitorActivityEvent): void {
  openCategoryProductByAsin(item.asin || "", item.categoryId);
}
</script>

<template>
  <section id="category-activity" class="panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>活动事件</h2>
        <p class="panel-caption">把排名、Review、价格和系统推断放进同一行，适合按事件流快速浏览。</p>
      </div>
      <span>{{ filteredActivityEvents.length }} / {{ activityEvents.length }} 条事件</span>
    </div>
    <div class="panel-controls">
      <select :value="activityEventFilter" @change="activityEventFilter = ($event.target as HTMLSelectElement).value as ActivityEventFilter">
        <option value="all">全部事件</option>
        <option v-for="option in activityEventOptions" :key="option.eventType" :value="option.eventType">{{ option.label }}</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>事件</th>
            <th>级别</th>
            <th>对象</th>
            <th>排名路径</th>
            <th>Review Delta</th>
            <th>价格变化</th>
            <th>系统判断</th>
            <th>建议动作</th>
            <th>打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredActivityEvents.slice(0, 100)" :key="item.eventKey">
            <td>{{ changeLabel(item.eventType) }}</td>
            <td><span :class="['level', item.eventLevel]">{{ levelLabel(item.eventLevel) }}</span></td>
            <td>
              <strong>{{ item.asin || item.brand || "-" }}</strong>
              <small>{{ item.title || localizeGeneratedText(item.eventSummary) }}</small>
            </td>
            <td>{{ item.rankBefore ? `#${item.rankBefore}` : "-" }} → {{ item.rankAfter ? `#${item.rankAfter}` : "-" }}</td>
            <td>{{ formatCount(item.reviewCountBefore) }} → {{ formatCount(item.reviewCountAfter) }} <small>{{ formatSignedCount(item.reviewCountChange) }}</small></td>
            <td>{{ formatMoney(item.priceBefore) }} → {{ formatMoney(item.priceAfter) }}</td>
            <td class="target-cell">{{ localizeGeneratedText(item.possibleStrategy) }}</td>
            <td class="target-cell">{{ localizeGeneratedText(item.suggestedAction) }}</td>
            <td class="link-col">
              <button v-if="item.asin" class="icon-button" title="打开 Amazon" type="button" @click="handleOpenProduct(item)">
                <ExternalLink :size="16" />
              </button>
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
