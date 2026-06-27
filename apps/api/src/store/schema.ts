import type { DatabaseSync } from "node:sqlite";
import { categorySchemaSql } from "./schema/category-schema.js";
import { insightSchemaSql } from "./schema/insight-schema.js";
import { keywordSchemaSql } from "./schema/keyword-schema.js";
import { metadataSchemaSql } from "./schema/metadata-schema.js";
import { monitorSchemaSql } from "./schema/monitor-schema.js";
import { notificationSchemaSql } from "./schema/notification-schema.js";
import { operationalSchemaSql } from "./schema/operational-schema.js";
import { queueSchemaSql } from "./schema/queue-schema.js";
import { workerSchemaSql } from "./schema/worker-schema.js";

const schemaSql = [
  monitorSchemaSql,
  categorySchemaSql,
  keywordSchemaSql,
  operationalSchemaSql,
  insightSchemaSql,
  notificationSchemaSql,
  metadataSchemaSql,
  queueSchemaSql,
  workerSchemaSql
].join("\n");

export function createTables(db: DatabaseSync): void {
  db.exec(schemaSql);
}
