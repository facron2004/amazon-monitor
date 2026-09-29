import { runCategoryCollectionForMonitor } from "./category-pipeline.js";
import { openAppStore } from "./store.js";
import { loadEnv } from "./notifier.js";

loadEnv();

const dbPath = process.env.DB_PATH ?? "E:/Program/Amazon/data/amazon-monitor.sqlite";
const store = openAppStore(dbPath);

// 回填 2026-09-17 缺失的 Sports & Action Video Cameras（category_id=2）
// 注：原 09-17 运行仅采到 Ice makers，Sports Cams 失败；此处以当前榜单最佳努力回填，保持连续快照不断档。
const log = await runCategoryCollectionForMonitor(store, 2, "2026-09-17");
console.log("BACKFILL 2026-09-17 SportsCams:", JSON.stringify({
  categoryId: 2,
  date: "2026-09-17",
  status: log.status,
  successCount: log.successCount,
  failCount: log.failCount,
  errorMessage: log.errorMessage ?? null
}));
