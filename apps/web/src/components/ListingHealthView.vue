<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElTag } from "element-plus";
import { ClipboardCheck, RefreshCw, Save, Sparkles } from "@lucide/vue";
import type { ListingHealthLevel, ProductListingHealthItem } from "@amazon-monitor/shared";
import { useListingHealthStore } from "../stores/listingHealth";
import AgentActionTaskButton from "./AgentActionTaskButton.vue";
import ListingRewriteDraftPanel from "./listing-health/ListingRewriteDraftPanel.vue";

const props = defineProps<{ date: string }>();

const store = useListingHealthStore();
const { items, selectedProductId, aiAnalysis, loading, saving, analyzing, error, query } = storeToRefs(store);

const snapshotDialogOpen = ref(false);
const snapshotForm = reactive({
  productId: 0,
  date: props.date,
  title: "",
  coreKeywords: "",
  bulletPoints: "",
  imageUrls: "",
  reviewHighlights: "",
  qaGaps: ""
});

const selectedItem = computed(() => items.value.find((item) => item.productId === selectedProductId.value) ?? null);
const riskCount = computed(() => items.value.filter((item) => item.health.level === "risk").length);
const watchCount = computed(() => items.value.filter((item) => item.health.level === "watch").length);
const averageScore = computed(() => {
  if (items.value.length === 0) return 0;
  return Math.round(items.value.reduce((sum, item) => sum + item.health.score, 0) / items.value.length);
});

watch(() => props.date, async (date) => {
  snapshotForm.date = date;
  await store.fetchItems(date);
});

onMounted(async () => {
  await store.fetchItems(props.date);
});

function levelType(level: ListingHealthLevel): "success" | "warning" | "danger" {
  if (level === "healthy") return "success";
  if (level === "watch") return "warning";
  return "danger";
}

function levelLabel(level: ListingHealthLevel): string {
  if (level === "healthy") return "Healthy";
  if (level === "watch") return "Watch";
  return "Risk";
}

function selectItem(item: ProductListingHealthItem): void {
  store.selectProduct(item.productId);
}

function openSnapshotDialog(item: ProductListingHealthItem): void {
  snapshotForm.productId = item.productId;
  snapshotForm.date = props.date;
  snapshotForm.title = item.listingTitle || item.productTitle;
  snapshotForm.coreKeywords = item.coreKeywords.join("\n");
  snapshotForm.bulletPoints = item.bulletPoints.join("\n");
  snapshotForm.imageUrls = item.imageUrls.join("\n");
  snapshotForm.reviewHighlights = item.reviewHighlights.join("\n");
  snapshotForm.qaGaps = item.qaGaps.join("\n");
  snapshotDialogOpen.value = true;
}

async function submitSnapshot(): Promise<void> {
  if (!snapshotForm.title.trim()) {
    ElMessage.warning("Title is required.");
    return;
  }
  try {
    await store.saveSnapshot(snapshotForm.productId, {
      date: snapshotForm.date,
      title: snapshotForm.title.trim(),
      coreKeywords: splitList(snapshotForm.coreKeywords),
      bulletPoints: splitList(snapshotForm.bulletPoints),
      imageUrls: splitList(snapshotForm.imageUrls),
      reviewHighlights: splitList(snapshotForm.reviewHighlights),
      qaGaps: splitList(snapshotForm.qaGaps),
      syncStatus: "manual",
      dataSource: "manual"
    }, props.date);
    snapshotDialogOpen.value = false;
    ElMessage.success("Listing snapshot saved.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function analyzeListing(): Promise<void> {
  try {
    await store.analyzeSelectedListing(props.date);
    ElMessage.success("Listing analysis generated.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function splitList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
</script>

<template>
  <section class="view listing-health-view">
    <header class="listing-toolbar panel">
      <div>
        <p class="eyebrow">Listing Health</p>
        <h2>Listing 健康巡检</h2>
      </div>
      <div class="listing-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="Search SKU / ASIN / title" style="width: 260px" @keyup.enter="store.fetchItems(props.date)" />
        <ElButton :loading="loading" @click="store.fetchItems(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          Refresh
        </ElButton>
      </div>
    </header>

    <div class="metrics listing-metrics">
      <article class="metric">
        <span>Inspected SKUs</span>
        <strong>{{ items.length }}</strong>
      </article>
      <article class="metric hot">
        <span>Risk score &lt; 70</span>
        <strong>{{ riskCount }}</strong>
      </article>
      <article class="metric">
        <span>Watch list</span>
        <strong>{{ watchCount }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Average score</span>
        <strong>{{ averageScore }}</strong>
      </article>
    </div>

    <p v-if="error" class="listing-error">{{ error }}</p>

    <div class="listing-layout">
      <section class="panel listing-list-panel">
        <div class="panel-head">
          <div>
            <h2>SKU Listing queue</h2>
            <span>Evidence date {{ props.date }}</span>
          </div>
        </div>

        <div v-if="loading && items.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading Listing health data</p>
        </div>

        <div v-else-if="items.length === 0" class="empty-state">
          <ClipboardCheck :size="28" />
          <p>No owned SKUs found. Create owned SKUs before running Listing inspection.</p>
        </div>

        <div v-else class="table-wrap compact-scroll listing-table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Score</th>
                <th>Issues</th>
                <th>Evidence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.productId"
                :class="{ selected: selectedProductId === item.productId }"
                @click="selectItem(item)"
              >
                <td class="listing-product-cell">
                  <strong>{{ item.sku }}</strong>
                  <span>{{ item.asin }} · {{ item.brand || "Unknown brand" }}</span>
                  <small>{{ item.listingTitle }}</small>
                </td>
                <td>
                  <strong :class="['listing-score', item.health.level]">{{ item.health.score }}</strong>
                  <ElTag :type="levelType(item.health.level)" size="small">{{ levelLabel(item.health.level) }}</ElTag>
                </td>
                <td>
                  <strong>{{ item.health.issues.length }}</strong>
                  <small>{{ item.health.issues[0]?.label ?? "No blocking issues" }}</small>
                </td>
                <td>
                  <strong>{{ item.snapshotDate ?? "No snapshot" }}</strong>
                  <small>{{ item.freshness.syncStatus }}</small>
                </td>
                <td>
                  <ElButton size="small" @click.stop="openSnapshotDialog(item)">
                    <template #icon><Save :size="12" /></template>
                    Snapshot
                  </ElButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel listing-detail-panel">
        <div v-if="!selectedItem" class="empty-state">
          <ClipboardCheck :size="28" />
          <p>Select a SKU to inspect Listing issues and Agent recommendations.</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ selectedItem.sku }}</h2>
              <span>{{ selectedItem.asin }} · score {{ selectedItem.health.score }}/100</span>
            </div>
            <div class="detail-actions">
              <ElButton size="small" @click="openSnapshotDialog(selectedItem)">
                <template #icon><Save :size="12" /></template>
                Snapshot
              </ElButton>
              <ElButton size="small" type="primary" :loading="analyzing" @click="analyzeListing">
                <template #icon><Sparkles :size="12" /></template>
                Analyze
              </ElButton>
            </div>
          </div>

          <section class="listing-title-box">
            <span>Current title</span>
            <strong>{{ selectedItem.listingTitle }}</strong>
          </section>

          <section class="listing-section">
            <h3>Main issues</h3>
            <div v-if="selectedItem.health.issues.length === 0" class="listing-ok">No blocking Listing issues from current evidence.</div>
            <article v-for="issue in selectedItem.health.issues" :key="issue.key" class="listing-issue">
              <ElTag :type="issue.level === 'fail' ? 'danger' : 'warning'" size="small">{{ issue.level }}</ElTag>
              <div>
                <strong>{{ issue.label }}</strong>
                <p>{{ issue.message }}</p>
                <small>{{ issue.suggestion }}</small>
              </div>
            </article>
          </section>

          <section class="listing-section">
            <h3>Evidence</h3>
            <div class="evidence-grid">
              <span>Core keywords</span>
              <p>{{ selectedItem.coreKeywords.join(", ") || "Not provided" }}</p>
              <span>Review highlights</span>
              <p>{{ selectedItem.reviewHighlights.join(", ") || "Not provided" }}</p>
              <span>Q&A gaps</span>
              <p>{{ selectedItem.qaGaps.join(", ") || "None" }}</p>
            </div>
          </section>

          <section v-if="aiAnalysis" class="listing-section agent-output">
            <h3>Listing Optimizer Agent</h3>
            <strong>{{ aiAnalysis.output.summary }}</strong>
            <p>{{ aiAnalysis.output.impact }}</p>
            <ListingRewriteDraftPanel
              v-if="aiAnalysis.output.artifacts?.listingRewrite"
              :draft="aiAnalysis.output.artifacts.listingRewrite"
            />
            <ol>
              <li v-for="action in aiAnalysis.output.recommended_actions" :key="action.action">
                <span>{{ action.priority }}</span>
                <div>
                  <strong>{{ action.action }}</strong>
                  <small>{{ action.reason }}</small>
                  <AgentActionTaskButton
                    :run-id="aiAnalysis.run.id"
                    agent-type="listing_optimizer"
                    :output="aiAnalysis.output"
                    :action="action"
                    :related-asin="selectedItem.asin"
                    :related-brand="selectedItem.brand"
                  />
                </div>
              </li>
            </ol>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-model="snapshotDialogOpen" title="Listing snapshot" width="720px">
      <div class="snapshot-form">
        <ElInput v-model="snapshotForm.date" placeholder="Date" />
        <ElInput v-model="snapshotForm.title" class="wide" placeholder="Listing title" />
        <ElInput v-model="snapshotForm.coreKeywords" type="textarea" :rows="3" placeholder="Core keywords, comma or newline separated" />
        <ElInput v-model="snapshotForm.imageUrls" type="textarea" :rows="3" placeholder="Image URLs, one per line" />
        <ElInput v-model="snapshotForm.bulletPoints" class="wide" type="textarea" :rows="5" placeholder="Bullet points, one per line" />
        <ElInput v-model="snapshotForm.reviewHighlights" type="textarea" :rows="3" placeholder="Review VOC highlights" />
        <ElInput v-model="snapshotForm.qaGaps" type="textarea" :rows="3" placeholder="Open Q&A gaps" />
      </div>
      <template #footer>
        <ElButton @click="snapshotDialogOpen = false">Cancel</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitSnapshot">Save snapshot</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped src="../styles/listing-health.css"></style>
