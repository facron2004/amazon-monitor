<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { MessageSquare, Plus, RefreshCw, Sparkles } from "@lucide/vue";
import type { ReviewSentiment, ReviewVocLevel, ReviewVocSummary } from "@amazon-monitor/shared";
import { useReviewVocStore } from "../stores/reviewVoc";

const props = defineProps<{ date: string }>();

const store = useReviewVocStore();
const { summaries, selectedProductId, selectedSummary, aiAnalysis, loading, saving, analyzing, error, query } = storeToRefs(store);

const reviewDialogOpen = ref(false);
const reviewForm = reactive({
  productId: 0,
  reviewDate: props.date,
  externalReviewId: "",
  rating: 3,
  title: "",
  body: "",
  reviewerName: "",
  variant: "",
  sentiment: "" as ReviewSentiment | "",
  topics: ""
});

watch(() => props.date, async (date) => {
  reviewForm.reviewDate = date;
  await store.fetchSummaries(date);
});

onMounted(async () => {
  await store.fetchSummaries(props.date);
});

function selectSummary(summary: ReviewVocSummary): void {
  store.selectProduct(summary.productId);
}

function openReviewDialog(summary?: ReviewVocSummary): void {
  reviewForm.productId = summary?.productId ?? selectedSummary.value?.productId ?? 0;
  reviewForm.reviewDate = props.date;
  reviewForm.externalReviewId = "";
  reviewForm.rating = 3;
  reviewForm.title = "";
  reviewForm.body = "";
  reviewForm.reviewerName = "";
  reviewForm.variant = "";
  reviewForm.sentiment = "";
  reviewForm.topics = "";
  reviewDialogOpen.value = true;
}

async function submitReview(): Promise<void> {
  if (!reviewForm.productId || !reviewForm.title.trim() || !reviewForm.body.trim()) {
    ElMessage.warning("Product ID, title, and body are required.");
    return;
  }
  try {
    await store.saveReview(reviewForm.productId, {
      reviewDate: reviewForm.reviewDate,
      externalReviewId: emptyToNull(reviewForm.externalReviewId),
      rating: reviewForm.rating,
      title: reviewForm.title.trim(),
      body: reviewForm.body.trim(),
      reviewerName: emptyToNull(reviewForm.reviewerName),
      variant: emptyToNull(reviewForm.variant),
      sentiment: reviewForm.sentiment || null,
      topics: splitTopics(reviewForm.topics),
      verifiedPurchase: true,
      syncStatus: "manual",
      dataSource: "manual"
    }, props.date);
    reviewDialogOpen.value = false;
    ElMessage.success("Review evidence saved.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function analyzeReviewVoc(): Promise<void> {
  try {
    await store.analyzeSelected(props.date);
    ElMessage.success("Review VOC analysis generated.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function levelType(level: ReviewVocLevel): "success" | "warning" | "danger" {
  if (level === "healthy") return "success";
  if (level === "watch") return "warning";
  return "danger";
}

function formatRating(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function splitTopics(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
</script>

<template>
  <section class="view review-voc-view">
    <header class="review-voc-toolbar panel">
      <div>
        <p class="eyebrow">Review VOC</p>
        <h2>Review / Q&A 声音诊断</h2>
      </div>
      <div class="review-voc-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="Search SKU / ASIN / review text" style="width: 280px" @keyup.enter="store.fetchSummaries(props.date)" />
        <ElButton :loading="loading" @click="store.fetchSummaries(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          Refresh
        </ElButton>
        <ElButton type="primary" @click="openReviewDialog()">
          <template #icon><Plus :size="14" /></template>
          Review
        </ElButton>
      </div>
    </header>

    <div class="metrics review-voc-metrics">
      <article class="metric">
        <span>SKUs</span>
        <strong>{{ summaries.length }}</strong>
      </article>
      <article class="metric hot">
        <span>Risk SKUs</span>
        <strong>{{ summaries.filter((item) => item.level === "risk").length }}</strong>
      </article>
      <article class="metric">
        <span>Negative reviews</span>
        <strong>{{ summaries.reduce((sum, item) => sum + item.negativeCount, 0) }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Avg rating</span>
        <strong>{{ formatRating(selectedSummary?.averageRating ?? null) }}</strong>
      </article>
    </div>

    <p v-if="error" class="review-voc-error">{{ error }}</p>

    <div class="review-voc-layout">
      <section class="panel review-voc-list-panel">
        <div class="panel-head">
          <div>
            <h2>SKU VOC queue</h2>
            <span>Recent {{ selectedSummary?.windowDays ?? 30 }} days through {{ props.date }}</span>
          </div>
        </div>

        <div v-if="loading && summaries.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading Review VOC data</p>
        </div>

        <div v-else-if="summaries.length === 0" class="empty-state">
          <MessageSquare :size="28" />
          <p>No owned SKUs found. Create owned SKUs before importing review evidence.</p>
        </div>

        <div v-else class="table-wrap compact-scroll review-voc-table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Reviews</th>
                <th>Negative</th>
                <th>Rating</th>
                <th>Level</th>
                <th>Top issue</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="summary in summaries"
                :key="summary.productId"
                :class="{ selected: selectedProductId === summary.productId }"
                @click="selectSummary(summary)"
              >
                <td class="review-voc-product-cell">
                  <strong>{{ summary.sku }}</strong>
                  <span>{{ summary.asin }} · {{ summary.brand || "Unknown brand" }}</span>
                  <small>{{ summary.productTitle }}</small>
                </td>
                <td>{{ summary.reviewCount }}</td>
                <td><strong>{{ summary.negativeCount }}</strong> <small>{{ formatPercent(summary.negativeRate) }}</small></td>
                <td>{{ formatRating(summary.averageRating) }}</td>
                <td><ElTag :type="levelType(summary.level)" size="small">{{ summary.level }}</ElTag></td>
                <td>
                  <strong>{{ summary.issues[0]?.label ?? "Stable" }}</strong>
                  <small>{{ summary.issues[0]?.priority ?? "P2" }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel review-voc-detail-panel">
        <div v-if="!selectedSummary" class="empty-state">
          <MessageSquare :size="28" />
          <p>Select a SKU to inspect VOC themes.</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ selectedSummary.sku }}</h2>
              <span>{{ selectedSummary.asin }} · {{ selectedSummary.reviewCount }} reviews</span>
            </div>
            <div class="review-voc-detail-actions">
              <ElButton size="small" @click="openReviewDialog(selectedSummary)">
                <template #icon><Plus :size="12" /></template>
                Review
              </ElButton>
              <ElButton size="small" type="primary" :loading="analyzing" @click="analyzeReviewVoc">
                <template #icon><Sparkles :size="12" /></template>
                Analyze
              </ElButton>
            </div>
          </div>

          <section class="review-voc-topic-grid">
            <article v-for="topic in selectedSummary.topTopics" :key="topic.topic">
              <strong>{{ topic.topic }}</strong>
              <span>{{ topic.negativeCount }} negative / {{ topic.mentionCount }} mentions</span>
            </article>
            <article v-if="selectedSummary.topTopics.length === 0">
              <strong>No topics</strong>
              <span>Import review text to build VOC clusters.</span>
            </article>
          </section>

          <section class="review-voc-section">
            <h3>Issues</h3>
            <div v-if="selectedSummary.issues.length === 0" class="review-voc-ok">No concentrated negative review theme in the current window.</div>
            <article v-for="issue in selectedSummary.issues" :key="issue.type" class="review-voc-issue">
              <ElTag :type="issue.priority === 'P0' ? 'danger' : 'warning'" size="small">{{ issue.priority }}</ElTag>
              <div>
                <strong>{{ issue.label }}</strong>
                <p>{{ issue.message }}</p>
                <small>{{ issue.suggestion }}</small>
              </div>
            </article>
          </section>

          <section class="review-voc-section">
            <h3>Recent reviews</h3>
            <article v-for="review in selectedSummary.recentReviews" :key="review.id" class="review-voc-review">
              <strong>{{ review.rating }}★ · {{ review.title }}</strong>
              <p>{{ review.body }}</p>
              <small>{{ review.reviewDate }} · {{ review.sentiment }} · {{ review.topics.join(", ") || "no topic" }}</small>
            </article>
            <div v-if="selectedSummary.recentReviews.length === 0" class="review-voc-ok">No review samples available.</div>
          </section>

          <section v-if="aiAnalysis" class="review-voc-section agent-output">
            <h3>Review VOC Agent</h3>
            <strong>{{ aiAnalysis.output.summary }}</strong>
            <p>{{ aiAnalysis.output.impact }}</p>
            <ol>
              <li v-for="action in aiAnalysis.output.recommended_actions" :key="action.action">
                <span>{{ action.priority }}</span>
                <div>
                  <strong>{{ action.action }}</strong>
                  <small>{{ action.reason }}</small>
                </div>
              </li>
            </ol>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-model="reviewDialogOpen" title="Review evidence" width="720px">
      <div class="review-voc-form">
        <ElInputNumber v-model="reviewForm.productId" :min="1" placeholder="Product ID" />
        <ElInput v-model="reviewForm.reviewDate" placeholder="Review date" />
        <ElInputNumber v-model="reviewForm.rating" :min="1" :max="5" :step="0.5" placeholder="Rating" />
        <ElSelect v-model="reviewForm.sentiment" clearable placeholder="Sentiment">
          <ElOption label="Positive" value="positive" />
          <ElOption label="Neutral" value="neutral" />
          <ElOption label="Negative" value="negative" />
        </ElSelect>
        <ElInput v-model="reviewForm.externalReviewId" placeholder="External review ID" />
        <ElInput v-model="reviewForm.reviewerName" placeholder="Reviewer" />
        <ElInput v-model="reviewForm.variant" placeholder="Variant" />
        <ElInput v-model="reviewForm.topics" placeholder="Topics, comma separated" />
        <ElInput v-model="reviewForm.title" class="wide" placeholder="Review title" />
        <ElInput v-model="reviewForm.body" class="wide" type="textarea" :rows="5" placeholder="Review body" />
      </div>
      <template #footer>
        <ElButton @click="reviewDialogOpen = false">Cancel</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitReview">Save review</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped src="../styles/review-voc.css"></style>
