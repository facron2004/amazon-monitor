<script setup lang="ts">
import { categoryLabel } from "../utils/formatters";
import { useCategoryOverviewStage, type CategoryOverviewStageSource } from "../composables/useCategoryOverviewStage";

const props = defineProps<CategoryOverviewStageSource>();
const { strongestBrand, heroDetail, commandStories, overviewBands, flowSections } = useCategoryOverviewStage(props);
</script>

<template>
  <section class="panel dense-panel info-flow-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>情报总览台</h2>
        <p class="panel-caption">先抓住今天的主线，再进入表格复盘；让页面先回答“该先看什么”，再回答“细节是什么”。</p>
      </div>
      <span>{{ selectedCategory ? categoryLabel(selectedCategory.name) : "未选择类目" }}</span>
    </div>

    <div class="intel-stage-layout">
      <div class="intel-stage-main">
        <article class="intel-hero-card">
          <span class="intel-kicker">今日情报主线</span>
          <strong>
            {{ strongestBrand ? `${strongestBrand.brand} 仍是当前榜单的主导品牌` : "当前类目还没有形成稳定的品牌主导格局" }}
          </strong>
          <p>{{ heroDetail }}</p>
        </article>

        <div class="intel-story-grid">
          <article v-for="item in commandStories" :key="item.kicker" :class="['intel-story-card', `intel-story-card--${item.tone}`]">
            <span>{{ item.kicker }}</span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.detail }}</p>
          </article>
        </div>
      </div>

      <div class="intel-stage-side">
        <div class="intel-band-list">
          <article v-for="item in overviewBands" :key="item.label" class="intel-band-card">
            <div class="intel-band-head">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
            <div class="intel-band-track">
              <span :class="`tone-${item.tone}`" :style="{ width: `${item.width}%` }"></span>
            </div>
            <small>{{ item.note }}</small>
          </article>
        </div>

        <div class="section-jump-grid section-jump-grid--stacked">
          <a v-for="section in flowSections" :key="section.id" class="section-jump" :href="`#${section.id}`">
            <strong>{{ section.label }}</strong>
            <span>{{ section.meta }}</span>
            <small>{{ section.note }}</small>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
