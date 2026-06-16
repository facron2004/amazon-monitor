<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import { categoryLabel, changeLabel, levelLabel, localizeGeneratedText } from "../utils/formatters";

const store = useCategoryStore();
const { visibleActionInsights } = storeToRefs(store);
</script>

<template>
  <section id="category-insights" class="panel dense-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>动作洞察</h2>
        <p class="panel-caption">把系统生成的证据、判断和建议动作放在一起，便于安排复盘与跟进。</p>
      </div>
      <span>{{ visibleActionInsights.length }} 条</span>
    </div>
    <div class="table-wrap compact-scroll insight-scroll">
      <table>
        <thead>
          <tr>
            <th>置信度</th>
            <th>证据日期</th>
            <th>动作</th>
            <th>对象</th>
            <th>排名路径</th>
            <th>证据</th>
            <th>系统判断</th>
            <th>建议动作</th>
            <th>打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in visibleActionInsights" :key="`${item.sourceType}-${item.category}-${item.asin || item.brand}-${item.insightType}`">
            <td><span :class="['level', item.confidence]">{{ levelLabel(item.confidence) }}</span></td>
            <td>{{ item.previousDate ? `${item.previousDate} → ${item.insightDate}` : item.insightDate }}</td>
            <td>{{ changeLabel(item.insightType) }}</td>
            <td>
              <strong>{{ item.asin || item.brand || "-" }}</strong>
              <small>{{ item.title || categoryLabel(item.category) }}</small>
            </td>
            <td>{{ item.previousRank ? `#${item.previousRank}` : "-" }} → {{ item.currentRank ? `#${item.currentRank}` : "-" }}</td>
            <td class="target-cell">{{ localizeGeneratedText(item.evidence) }}</td>
            <td class="target-cell">{{ localizeGeneratedText(item.inferredAction) }}</td>
            <td class="target-cell">{{ localizeGeneratedText(item.suggestedResponse) }}</td>
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
