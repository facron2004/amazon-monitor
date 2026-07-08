import type { DatabaseSync } from "node:sqlite";
import { adsSchemaSql } from "./schema/ads-schema.js";
import { aiSchemaSql } from "./schema/ai-schema.js";
import { categorySchemaSql } from "./schema/category-schema.js";
import { identitySchemaSql } from "./schema/identity-schema.js";
import { insightSchemaSql } from "./schema/insight-schema.js";
import { inventorySchemaSql } from "./schema/inventory-schema.js";
import { keywordSchemaSql } from "./schema/keyword-schema.js";
import { metadataSchemaSql } from "./schema/metadata-schema.js";
import { monitorSchemaSql } from "./schema/monitor-schema.js";
import { notificationSchemaSql } from "./schema/notification-schema.js";
import { operationalSchemaSql } from "./schema/operational-schema.js";
import { productSchemaSql } from "./schema/product-schema.js";
import { profitSchemaSql } from "./schema/profit-schema.js";
import { queueSchemaSql } from "./schema/queue-schema.js";
import { reviewVocSchemaSql } from "./schema/review-voc-schema.js";
import { workerSchemaSql } from "./schema/worker-schema.js";
import { workflowSchemaSql } from "./schema/workflow-schema.js";

const schemaSql = [
  monitorSchemaSql,
  categorySchemaSql,
  keywordSchemaSql,
  operationalSchemaSql,
  insightSchemaSql,
  notificationSchemaSql,
  identitySchemaSql,
  productSchemaSql,
  inventorySchemaSql,
  profitSchemaSql,
  reviewVocSchemaSql,
  adsSchemaSql,
  workflowSchemaSql,
  aiSchemaSql,
  metadataSchemaSql,
  queueSchemaSql,
  workerSchemaSql
].join("\n");

export function createTables(db: DatabaseSync): void {
  db.exec(schemaSql);
}
