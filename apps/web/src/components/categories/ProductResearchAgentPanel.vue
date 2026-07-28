<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { AlertTriangle, BrainCircuit, Check, Plus, RefreshCw, ShieldCheck, Sparkles } from "@lucide/vue";
import type { AiProductResearchResponse } from "@amazon-monitor/shared";
import { aiApi } from "../../api-ai";
import { useCategoryStore } from "../../stores/category";
import { useWriteAccess } from "../../composables/useWriteAccess";
import AgentDataFreshness from "../ai-agents/AgentDataFreshness.vue";
import ProductLaunchBriefPanel from "./ProductLaunchBriefPanel.vue";

const props = defineProps<{ date: string }>();

const store = useCategoryStore();
const { selectedCategoryId, selectedCategory, categoryDataDate } = storeToRefs(store);
const { canWrite } = useWriteAccess("manage_competitors");
const result = ref<AiProductResearchResponse | null>(null);
const loading = ref(false);
const error = ref("");
const addingAsin = ref<string | null>(null);
const poolError = ref("");

const analysisDate = computed(() => categoryDataDate.value || props.date);

watch(selectedCategoryId, () => {
  result.value = null;
  error.value = "";
});

async function runResearch(): Promise<void> {
  if (!selectedCategoryId.value) return;
  loading.value = true;
  error.value = "";
  try {
    result.value = await aiApi.researchProduct(selectedCategoryId.value, analysisDate.value);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    loading.value = false;
  }
}

async function addRecommendedCompetitor(asin: string): Promise<void> {
  if (!canWrite.value || addingAsin.value) return;
  addingAsin.value = asin;
  poolError.value = "";
  try {
    await store.addCategoryCompetitor(asin);
    const candidate = result.value?.context.recommendedCompetitors.find((item) => item.asin === asin);
    if (candidate) candidate.isInCompetitorPool = true;
  } catch (reason) {
    poolError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    addingAsin.value = null;
  }
}

function formatPrice(value: number | null): string {
  return value === null ? "暂无" : value.toFixed(2);
}

function candidateLabel(
  candidateType: AiProductResearchResponse["context"]["recommendedCompetitors"][number]["candidateType"]
): string {
  if (candidateType === "breakout_low_review") return "新品黑马 · 低 Review";
  if (candidateType === "new_product_breakout") return "新品黑马";
  return "Top50 · 低 Review";
}
</script>

<template>
  <section class="panel research-panel">
    <header class="research-panel__header">
      <div class="research-panel__title">
        <span class="research-panel__icon"><BrainCircuit :size="18" /></span>
        <div>
          <p class="eyebrow">Product Research Agent</p>
          <h2>类目选品研判</h2>
          <span>{{ selectedCategory?.name || "请先选择类目" }} · 证据日期 {{ analysisDate }}</span>
        </div>
      </div>
      <button
        type="button"
        class="research-panel__run"
        :disabled="!selectedCategoryId || !canWrite || loading"
        :title="canWrite ? '基于当前类目证据生成选品建议' : '当前角色无选品分析权限'"
        @click="runResearch"
      >
        <RefreshCw v-if="loading" class="research-panel__spin" :size="15" />
        <Sparkles v-else :size="15" />
        <span>{{ loading ? "分析中" : result ? "重新分析" : "生成选品建议" }}</span>
      </button>
    </header>

    <div v-if="error" class="research-panel__error" role="alert">
      <AlertTriangle :size="17" />
      <span>{{ error }}</span>
      <button type="button" @click="runResearch">重试</button>
    </div>

    <div v-if="result" class="research-panel__result">
      <AgentDataFreshness
        v-if="result.output.dataFreshness"
        :freshness="result.output.dataFreshness"
      />

      <div class="research-panel__metrics">
        <article><span>榜单样本</span><strong>{{ result.context.snapshotCount }}</strong></article>
        <article><span>品牌数</span><strong>{{ result.context.brandCount }}</strong></article>
        <article><span>中位价格</span><strong>{{ formatPrice(result.context.medianPrice) }}</strong></article>
        <article><span>新品 / 低评 Top50</span><strong>{{ result.context.newProductCount }} / {{ result.context.lowReviewTop50Count }}</strong></article>
      </div>

      <div class="research-panel__narrative">
        <div>
          <h3>研判</h3>
          <p>{{ result.output.summary }}</p>
          <p>{{ result.output.impact }}</p>
        </div>
        <div>
          <h3>证据</h3>
          <ul><li v-for="item in result.output.evidence" :key="item">{{ item }}</li></ul>
        </div>
      </div>

      <ProductLaunchBriefPanel
        v-if="result.output.artifacts?.productLaunchBrief"
        :brief="result.output.artifacts.productLaunchBrief"
        :run-id="result.run.id"
        :data-freshness="result.output.dataFreshness"
      />

      <section v-if="result.context.recommendedCompetitors.length" class="research-panel__candidates">
        <header>
          <div>
            <h3>Agent 推荐监控候选</h3>
            <p>候选来自当前榜单证据；加入竞品池仍需人工确认。</p>
          </div>
          <span>{{ result.context.recommendedCompetitors.length }} 个候选</span>
        </header>
        <p v-if="poolError" class="research-panel__pool-error" role="alert">{{ poolError }}</p>
        <article v-for="candidate in result.context.recommendedCompetitors" :key="candidate.asin">
          <div class="research-panel__candidate-main">
            <span class="research-panel__candidate-type">{{ candidateLabel(candidate.candidateType) }}</span>
            <strong>{{ candidate.brand || "未知品牌" }} · {{ candidate.asin }}</strong>
            <p>{{ candidate.title }}</p>
            <small>{{ candidate.reason }}</small>
          </div>
          <div class="research-panel__candidate-metrics">
            <span>排名 <strong>#{{ candidate.rank }}</strong></span>
            <span>价格 <strong>{{ formatPrice(candidate.price) }}</strong></span>
            <span>Review <strong>{{ candidate.reviewCount ?? "-" }}</strong></span>
          </div>
          <button
            type="button"
            class="research-panel__pool-action"
            :class="{ 'research-panel__pool-action--added': candidate.isInCompetitorPool }"
            :disabled="candidate.isInCompetitorPool || !canWrite || addingAsin === candidate.asin"
            :title="candidate.isInCompetitorPool ? '已在竞品池' : canWrite ? '人工确认加入竞品池' : '当前角色无竞品管理权限'"
            @click="addRecommendedCompetitor(candidate.asin)"
          >
            <Check v-if="candidate.isInCompetitorPool" :size="14" />
            <RefreshCw v-else-if="addingAsin === candidate.asin" class="research-panel__spin" :size="14" />
            <Plus v-else :size="14" />
            <span>{{ candidate.isInCompetitorPool ? "已入池" : addingAsin === candidate.asin ? "加入中" : "加入竞品池" }}</span>
          </button>
        </article>
      </section>

      <div class="research-panel__actions">
        <article v-for="action in result.output.recommended_actions" :key="action.action">
          <div><span :data-priority="action.priority">{{ action.priority }}</span><strong>{{ action.action }}</strong></div>
          <p>{{ action.reason }}</p>
          <small><ShieldCheck :size="13" /> 需人工确认 · 风险：{{ action.risk }}</small>
        </article>
      </div>
    </div>

    <div v-else-if="!error" class="research-panel__empty">
      <p>基于当前 Top100、品牌矩阵、价格带和新品信号生成可追溯的选品建议；缺少 VOC 时会明确标记数据缺口。</p>
    </div>
  </section>
</template>

<style scoped>
.research-panel { display: grid; gap: 14px; }
.research-panel__header,
.research-panel__title,
.research-panel__run,
.research-panel__error,
.research-panel__actions article > div,
.research-panel__actions small { align-items: center; display: flex; }
.research-panel__header { gap: 16px; justify-content: space-between; }
.research-panel__title { gap: 10px; min-width: 0; }
.research-panel__icon { align-items: center; background: #edf5ff; border-radius: 7px; color: #0071e3; display: inline-flex; height: 36px; justify-content: center; width: 36px; }
.research-panel h2,
.research-panel h3,
.research-panel p { margin: 0; }
.research-panel__title h2 { font-size: 16px; }
.research-panel__title span { color: #6e6e73; font-size: 12px; }
.research-panel__run { background: #0071e3; border: 0; border-radius: 7px; color: #fff; cursor: pointer; font: inherit; font-size: 12px; font-weight: 650; gap: 6px; min-height: 34px; padding: 0 12px; }
.research-panel__run:disabled { cursor: not-allowed; opacity: 0.5; }
.research-panel__spin { animation: research-spin 0.8s linear infinite; }
.research-panel__error { background: #fff7f6; border: 1px solid #f3c4c0; border-radius: 7px; color: #b42318; gap: 8px; padding: 10px 12px; }
.research-panel__error span { flex: 1; font-size: 12px; }
.research-panel__error button { background: #fff; border: 1px solid #d2d2d7; border-radius: 6px; cursor: pointer; padding: 5px 10px; }
.research-panel__metrics { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.research-panel__metrics article { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 7px; display: grid; gap: 4px; padding: 10px 12px; }
.research-panel__metrics span { color: #6e6e73; font-size: 11px; }
.research-panel__metrics strong { color: #1d1d1f; font-size: 16px; }
.research-panel__narrative { display: grid; gap: 16px; grid-template-columns: 0.9fr 1.1fr; }
.research-panel__narrative > div { min-width: 0; }
.research-panel__narrative h3 { font-size: 13px; margin-bottom: 6px; }
.research-panel__narrative p,
.research-panel__narrative li { color: #4b5563; font-size: 12px; line-height: 1.55; }
.research-panel__narrative p + p { margin-top: 6px; }
.research-panel__narrative ul { margin: 0; padding-left: 18px; }
.research-panel__candidates { display: grid; gap: 8px; }
.research-panel__candidates > header { align-items: flex-end; display: flex; gap: 12px; justify-content: space-between; }
.research-panel__candidates > header h3 { font-size: 13px; }
.research-panel__candidates > header p,
.research-panel__candidates > header > span { color: #6e6e73; font-size: 11px; }
.research-panel__candidates > article { align-items: center; border: 1px solid #e5e7eb; border-radius: 7px; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) auto auto; padding: 10px 12px; }
.research-panel__candidate-main { display: grid; gap: 3px; min-width: 0; }
.research-panel__candidate-main strong { font-size: 12px; }
.research-panel__candidate-main p { color: #4b5563; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.research-panel__candidate-main small { color: #6e6e73; font-size: 10px; line-height: 1.45; }
.research-panel__candidate-type { color: #b45309; font-size: 10px; font-weight: 700; }
.research-panel__candidate-metrics { display: flex; gap: 12px; }
.research-panel__candidate-metrics span { color: #6e6e73; display: grid; font-size: 10px; gap: 2px; }
.research-panel__candidate-metrics strong { color: #1d1d1f; font-size: 12px; }
.research-panel__pool-action { align-items: center; background: #fff; border: 1px solid #b9d7f7; border-radius: 6px; color: #0066cc; cursor: pointer; display: inline-flex; font: inherit; font-size: 11px; font-weight: 650; gap: 5px; min-height: 32px; padding: 0 10px; white-space: nowrap; }
.research-panel__pool-action:hover:not(:disabled) { background: #edf5ff; }
.research-panel__pool-action:disabled { cursor: not-allowed; opacity: 0.55; }
.research-panel__pool-action--added { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; opacity: 1; }
.research-panel__pool-error { background: #fff7f6; border: 1px solid #f3c4c0; border-radius: 6px; color: #b42318; font-size: 11px; padding: 7px 9px; }
.research-panel__actions { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.research-panel__actions article { border: 1px solid #e5e7eb; border-radius: 7px; padding: 10px 12px; }
.research-panel__actions article > div { gap: 8px; }
.research-panel__actions article > div span { background: #eef2ff; border-radius: 4px; color: #3730a3; font-size: 10px; font-weight: 700; padding: 2px 5px; }
.research-panel__actions article > div span[data-priority="P1"] { background: #fff7ed; color: #b45309; }
.research-panel__actions strong { font-size: 12px; }
.research-panel__actions p { color: #4b5563; font-size: 11px; line-height: 1.45; margin-top: 6px; }
.research-panel__actions small { color: #6e6e73; font-size: 10px; gap: 4px; margin-top: 7px; }
.research-panel__empty { color: #6e6e73; font-size: 12px; padding: 4px 0; }
@keyframes research-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .research-panel__header { align-items: stretch; flex-direction: column; }
  .research-panel__run { justify-content: center; width: 100%; }
  .research-panel__metrics { grid-template-columns: 1fr 1fr; }
  .research-panel__narrative,
  .research-panel__actions { grid-template-columns: 1fr; }
  .research-panel__candidates > article { align-items: stretch; grid-template-columns: 1fr; }
  .research-panel__candidate-metrics { justify-content: space-between; }
  .research-panel__pool-action { justify-content: center; width: 100%; }
}
</style>
