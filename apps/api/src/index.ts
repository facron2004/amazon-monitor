import { fileURLToPath } from "node:url";
import { loadEnv } from "./notifier.js";

loadEnv();

import cron from "node-cron";
import { sendDueNotificationSchedules } from "./notifier.js";
import { runCategoryCollectionForAll } from "./category-pipeline.js";
import { createApiApp } from "./server.js";
import { runCollectionForAll } from "./pipeline.js";
import { attachCronDiagnostics, createExclusiveCronRunner } from "./scheduler.js";
import { openAppStore } from "./store.js";

const port = Number(process.env.PORT ?? 4000);
const defaultDbPath = (() => {
  try {
    return fileURLToPath(new URL("../../../data/amazon-monitor.sqlite", import.meta.url));
  } catch {
    return "data/amazon-monitor.sqlite";
  }
})();
const store = openAppStore(process.env.DB_PATH ?? defaultDbPath);

function startCron() {
  if (process.env.ENABLE_CRON === "false") return;
  const collectionTask = cron.schedule(
    "0 9 * * *",
    createExclusiveCronRunner("daily-collection", () => Promise.all([runCollectionForAll(store), runCategoryCollectionForAll(store)])),
    { timezone: "Asia/Shanghai", name: "daily-collection", noOverlap: true }
  );
  attachCronDiagnostics(collectionTask, "daily-collection");

  const notificationTask = cron.schedule(
    "* * * * *",
    createExclusiveCronRunner("notifications", () => sendDueNotificationSchedules(store)),
    { timezone: "Asia/Shanghai", name: "notifications", noOverlap: true }
  );
  attachCronDiagnostics(notificationTask, "notifications");
}

export function startServer(silent = false) {
  startCron();
  return createApiApp(store).listen(port, () => {
    if (!silent) console.log(`Amazon monitor API listening on http://localhost:${port}`);
  });
}

startServer();
