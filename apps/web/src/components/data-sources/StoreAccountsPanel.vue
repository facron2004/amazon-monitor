<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { Plus, RefreshCw, Store, StoreIcon } from "@lucide/vue";
import type { CommerceStore, CommerceStoreAuthStatus, CommerceStoreStatus } from "@amazon-monitor/shared";
import { useWriteAccess } from "../../composables/useWriteAccess";
import { useCommerceStoresStore } from "../../stores/commerceStores";

const storeState = useCommerceStoresStore();
const { stores, loading, saving, error } = storeToRefs(storeState);
const { canWrite } = useWriteAccess("manage_data_sources");
const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  name: "",
  marketplace: "US",
  sellerId: "",
  authStatus: "not_connected" as CommerceStoreAuthStatus,
  status: "active" as CommerceStoreStatus
});

const connectedCount = computed(() => stores.value.filter((item) => item.authStatus === "connected").length);
const attentionCount = computed(() => stores.value.filter((item) => item.authStatus === "attention" || item.authStatus === "expired").length);

onMounted(() => storeState.fetchStores());

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { name: "", marketplace: "US", sellerId: "", authStatus: "not_connected", status: "active" });
  dialogOpen.value = true;
}

function openEdit(item: CommerceStore): void {
  editingId.value = item.id;
  Object.assign(form, {
    name: item.name,
    marketplace: item.marketplace,
    sellerId: item.sellerId,
    authStatus: item.authStatus,
    status: item.status
  });
  dialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!form.name.trim() || !form.marketplace.trim() || !form.sellerId.trim()) {
    ElMessage.warning("请填写店铺名称、站点和 Seller ID");
    return;
  }
  try {
    const payload = {
      name: form.name.trim(),
      marketplace: form.marketplace.trim().toUpperCase(),
      sellerId: form.sellerId.trim(),
      authStatus: form.authStatus,
      status: form.status
    };
    if (editingId.value) await storeState.updateStore(editingId.value, payload);
    else await storeState.createStore({ ...payload, platform: "amazon" });
    dialogOpen.value = false;
    ElMessage.success(editingId.value ? "店铺已更新" : "店铺已创建");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function authType(status: CommerceStoreAuthStatus): "success" | "warning" | "danger" | "info" {
  if (status === "connected") return "success";
  if (status === "expired") return "danger";
  if (status === "attention") return "warning";
  return "info";
}
</script>

<template>
  <section class="store-accounts" aria-label="店铺账号">
    <header class="store-accounts__head">
      <div>
        <p class="eyebrow">Store Accounts</p>
        <h2>Amazon 店铺</h2>
        <span>SKU 与 Seller 账号的组织级归属边界。</span>
      </div>
      <div class="store-accounts__actions">
        <span>{{ stores.length }} 个店铺 · {{ connectedCount }} 已连接 · {{ attentionCount }} 待处理</span>
        <ElButton circle :loading="loading" title="刷新店铺" @click="storeState.fetchStores()"><RefreshCw :size="15" /></ElButton>
        <ElButton v-if="canWrite" type="primary" @click="openCreate"><Plus :size="15" /><span>新增店铺</span></ElButton>
      </div>
    </header>

    <p v-if="error" class="store-accounts__error">{{ error }}</p>
    <div v-if="!loading && stores.length === 0" class="store-accounts__empty">
      <Store :size="22" />
      <span>尚未登记店铺。新增后可把自营 SKU 归属到具体 Seller 账号。</span>
    </div>
    <div v-else class="store-accounts__grid">
      <button v-for="item in stores" :key="item.id" type="button" class="store-account" @click="canWrite && openEdit(item)">
        <StoreIcon :size="18" />
        <span><strong>{{ item.name }}</strong><small>{{ item.marketplace }} · {{ item.sellerId }}</small></span>
        <ElTag size="small" :type="authType(item.authStatus)">{{ item.authStatus }}</ElTag>
        <ElTag v-if="item.status === 'paused'" size="small" type="info">paused</ElTag>
      </button>
    </div>

    <ElDialog v-model="dialogOpen" :title="editingId ? '编辑店铺' : '新增店铺'" width="480px" destroy-on-close>
      <div class="store-form">
        <label><span>店铺名称</span><ElInput v-model="form.name" placeholder="US Main Store" /></label>
        <label><span>站点</span><ElSelect v-model="form.marketplace"><ElOption v-for="item in ['US', 'UK', 'DE', 'JP']" :key="item" :label="item" :value="item" /></ElSelect></label>
        <label><span>Seller ID</span><ElInput v-model="form.sellerId" placeholder="A1EXAMPLESELLER" /></label>
        <label><span>授权状态</span><ElSelect v-model="form.authStatus"><ElOption v-for="item in ['not_connected', 'connected', 'attention', 'expired']" :key="item" :label="item" :value="item" /></ElSelect></label>
        <label><span>运营状态</span><ElSelect v-model="form.status"><ElOption label="active" value="active" /><ElOption label="paused" value="paused" /></ElSelect></label>
      </div>
      <template #footer><ElButton @click="dialogOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.store-accounts { border-bottom: 1px solid #e4e7ec; padding: 4px 0 22px; }
.store-accounts__head, .store-accounts__actions, .store-account, .store-accounts__empty { align-items: center; display: flex; }
.store-accounts__head { justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.store-accounts__head h2 { font-size: 18px; margin: 2px 0 3px; }
.store-accounts__head span, .store-accounts__actions { color: #667085; font-size: 12px; }
.store-accounts__actions { gap: 9px; }
.store-accounts__grid { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.store-account { background: #fff; border: 1px solid #e4e7ec; border-radius: 6px; color: #344054; gap: 10px; min-width: 0; padding: 12px; text-align: left; }
.store-account > span { display: grid; flex: 1; min-width: 0; }
.store-account strong, .store-account small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.store-account small { color: #667085; margin-top: 3px; }
.store-accounts__empty { background: #f8fafc; color: #667085; gap: 9px; justify-content: center; min-height: 72px; }
.store-accounts__error { color: #b42318; }
.store-form { display: grid; gap: 14px; }
.store-form label { display: grid; gap: 6px; }
.store-form label > span { color: #475467; font-size: 12px; font-weight: 600; }
@media (max-width: 900px) { .store-accounts__grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .store-accounts__head { align-items: flex-start; flex-direction: column; } .store-accounts__actions { flex-wrap: wrap; } }
</style>
