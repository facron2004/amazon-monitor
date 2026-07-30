import { fileURLToPath } from "node:url";
import { loadEnv } from "./notifier.js";

loadEnv();

import cron from "node-cron";
import { sendDueNotificationSchedules } from "./notifier.js";
import { createApiApp } from "./server.js";
import { enqueueScheduledSpApiSyncs } from "./services/sp-api-scheduler.js";
import { isoDate } from "./pipeline.js";
import { attachCronDiagnostics, createExclusiveCronRunner } from "./scheduler.js";
import { openAppStore } from "./store.js";
import { startWorker } from "./worker.js";
import {
  configureDesktopAgentRecoveryStarter,
  configureDesktopAgentStore,
  startRecoveryForJob,
} from "./services/desktop-agent-transport.js";
import { AgentRuntimeService } from "./services/agent-runtime-service.js";
import { recoverInterruptedAgentRuns } from "./services/agent-runtime-recovery.js";

const port = Number(process.env.PORT ?? 4000);
const defaultDbPath = (() => {
  try {
    return fileURLToPath(new URL("../../../data/amazon-monitor.sqlite", import.meta.url));
  } catch {
    return "data/amazon-monitor.sqlite";
  }
})();

// Set default WEB_DIST_PATH if not provided
if (!process.env.WEB_DIST_PATH) {
  try {
    process.env.WEB_DIST_PATH = fileURLToPath(new URL("../../web/dist", import.meta.url));
  } catch {
    // Fallback for production builds
    process.env.WEB_DIST_PATH = "apps/web/dist";
  }
}

const store = openAppStore(process.env.DB_PATH ?? defaultDbPath);
configureDesktopAgentStore(store);
recoverInterruptedAgentRuns(store);
const agentRuntime = new AgentRuntimeService(store);
configureDesktopAgentRecoveryStarter((run, freshnessInput) => {
  agentRuntime.start(run, freshnessInput);
});

function startCron() {
  if (process.env.ENABLE_CRON === "false") return;
  const collectionTask = cron.schedule(
    "0 9 * * *",
    createExclusiveCronRunner("daily-collection", async () => {
      const date = isoDate();
      const keywords = store.listKeywords({ status: "enabled" });
      for (const k of keywords) {
        store.pushJob("keyword", k.id, date, k.orgId);
      }
      const categories = store.listCategoryMonitors({ status: "enabled" });
      for (const c of categories) {
        store.pushJob("category", c.id, date, c.orgId);
      }
    }),
    { timezone: "Asia/Shanghai", name: "daily-collection", noOverlap: true }
  );
  attachCronDiagnostics(collectionTask, "daily-collection");

  const notificationTask = cron.schedule(
    "* * * * *",
    createExclusiveCronRunner("notifications", () => sendDueNotificationSchedules(store)),
    { timezone: "Asia/Shanghai", name: "notifications", noOverlap: true }
  );
  attachCronDiagnostics(notificationTask, "notifications");

  const spApiSalesTask = cron.schedule(
    "15 8 * * *",
    createExclusiveCronRunner("sp-api-sales-daily", () => {
      enqueueScheduledSpApiSyncs(store, "sales_daily");
    }),
    { timezone: "Asia/Shanghai", name: "sp-api-sales-daily", noOverlap: true }
  );
  attachCronDiagnostics(spApiSalesTask, "sp-api-sales-daily");

  const spApiInventoryTask = cron.schedule(
    "*/30 * * * *",
    createExclusiveCronRunner("sp-api-fba-incremental", () => {
      enqueueScheduledSpApiSyncs(store, "fba_incremental");
    }),
    { timezone: "Asia/Shanghai", name: "sp-api-fba-incremental", noOverlap: true }
  );
  attachCronDiagnostics(spApiInventoryTask, "sp-api-fba-incremental");

  const spApiReconcileTask = cron.schedule(
    "30 2 * * *",
    createExclusiveCronRunner("sp-api-fba-full-reconcile", () => {
      enqueueScheduledSpApiSyncs(store, "fba_full");
    }),
    { timezone: "Asia/Shanghai", name: "sp-api-fba-full-reconcile", noOverlap: true }
  );
  attachCronDiagnostics(spApiReconcileTask, "sp-api-fba-full-reconcile");
}

export function startServer(silent = false) {
  startCron();
  if (process.env.RUN_WORKER === "true") {
    startWorker(store, {
      onJobCompleted: (job) => {
        startRecoveryForJob(job.id);
      },
    }).catch((err) => {
      console.error("[Worker] Failed to start background worker thread:", err);
    });
  }
  return createApiApp(store, { agentRuntime }).listen(port, () => {
    if (!silent) console.log(`Amazon monitor API listening on http://localhost:${port}`);
  });
}

startServer();
