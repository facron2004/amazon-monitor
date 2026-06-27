import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("E:/Program/Amazon/data/amazon-monitor.sqlite", { readOnly: true });

const job28 = db.prepare(`SELECT * FROM amazon_collect_job_queue WHERE id = 28`).get();
console.log("Job 28:", JSON.stringify(job28, null, 2));