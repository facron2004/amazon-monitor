import type { DatabaseSync } from "node:sqlite";
import type {
  PromotionPlan,
  PromotionPlanStatus,
  PromotionPlanType,
  PromotionTaskKind,
  UpdatePromotionPlanInput
} from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type PromotionStoreMethods = Pick<
  Store,
  "createPromotionPlan" | "updatePromotionPlan" | "getPromotionPlan" | "listPromotionPlans" | "linkPromotionTask"
>;

interface PromotionPlanRow {
  id: number;
  org_id: number;
  store_id: number | null;
  store_name: string | null;
  product_id: number | null;
  sku: string | null;
  asin: string | null;
  brand: string | null;
  name: string;
  type: string;
  marketplace: string;
  start_date: string;
  end_date: string;
  status: string;
  target_price: number | null;
  budget: number | null;
  inventory_target: number | null;
  notes: string | null;
  preparation_task_id: number | null;
  review_task_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

const selectPromotion = `
  SELECT plans.*, stores.name AS store_name,
    products.sku, products.asin, products.brand
  FROM promotion_plans plans
  LEFT JOIN commerce_stores stores ON stores.id = plans.store_id
  LEFT JOIN own_products products ON products.id = plans.product_id
`;

export function createPromotionStore(db: DatabaseSync): PromotionStoreMethods {
  return {
    createPromotionPlan(input) {
      const timestamp = nowIso();
      const result = db.prepare(
        `INSERT INTO promotion_plans
         (org_id, store_id, product_id, name, type, marketplace, start_date, end_date, status,
          target_price, budget, inventory_target, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.orgId,
        input.storeId ?? null,
        input.productId ?? null,
        input.name,
        input.type,
        input.marketplace,
        input.startDate,
        input.endDate,
        input.status ?? "planned",
        input.targetPrice ?? null,
        input.budget ?? null,
        input.inventoryTarget ?? null,
        input.notes ?? null,
        input.createdBy ?? null,
        timestamp,
        timestamp
      );
      return getRequiredPromotion(db, Number(result.lastInsertRowid));
    },

    updatePromotionPlan(id, input: UpdatePromotionPlanInput) {
      const existing = this.getPromotionPlan(id);
      if (!existing) return null;
      db.prepare(
        `UPDATE promotion_plans SET
          store_id = ?, product_id = ?, name = ?, type = ?, marketplace = ?, start_date = ?, end_date = ?,
          status = ?, target_price = ?, budget = ?, inventory_target = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.storeId === undefined ? existing.storeId : input.storeId,
        input.productId === undefined ? existing.productId : input.productId,
        input.name ?? existing.name,
        input.type ?? existing.type,
        input.marketplace ?? existing.marketplace,
        input.startDate ?? existing.startDate,
        input.endDate ?? existing.endDate,
        input.status ?? existing.status,
        input.targetPrice === undefined ? existing.targetPrice : input.targetPrice,
        input.budget === undefined ? existing.budget : input.budget,
        input.inventoryTarget === undefined ? existing.inventoryTarget : input.inventoryTarget,
        input.notes === undefined ? existing.notes : input.notes,
        nowIso(),
        id
      );
      return this.getPromotionPlan(id);
    },

    getPromotionPlan(id) {
      return getOptionalPromotion(db, id);
    },

    listPromotionPlans(filter) {
      const { sql, params } = buildWhere(
        whereEq("plans.org_id", filter.orgId),
        whereEq("plans.store_id", filter.storeId),
        whereEq("plans.product_id", filter.productId),
        whereEq("plans.status", filter.status),
        filter.fromDate ? { clause: "plans.end_date >= ?", param: filter.fromDate } : null,
        filter.toDate ? { clause: "plans.start_date <= ?", param: filter.toDate } : null,
        promotionSearch(filter.q)
      );
      const limit = clampLimit(filter.limit ?? 200);
      const offset = clampOffset(filter.offset);
      const rows = db.prepare(
        `${selectPromotion} ${sql}
         ORDER BY CASE plans.status WHEN 'cancelled' THEN 2 WHEN 'completed' THEN 1 ELSE 0 END,
           plans.start_date ASC, plans.id ASC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset) as unknown as PromotionPlanRow[];
      return rows.map(mapPromotionPlan);
    },

    linkPromotionTask(id, kind: PromotionTaskKind, taskId: number) {
      const sql = kind === "preparation"
        ? "UPDATE promotion_plans SET preparation_task_id = ?, updated_at = ? WHERE id = ?"
        : "UPDATE promotion_plans SET review_task_id = ?, updated_at = ? WHERE id = ?";
      db.prepare(sql).run(taskId, nowIso(), id);
      return getRequiredPromotion(db, id);
    }
  };
}

function promotionSearch(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(plans.name) LIKE ? OR LOWER(products.sku) LIKE ? OR LOWER(products.asin) LIKE ? OR LOWER(products.brand) LIKE ?)",
    params: Array(4).fill(`%${value}%`)
  };
}

function getRequiredPromotion(db: DatabaseSync, id: number): PromotionPlan {
  const promotion = getOptionalPromotion(db, id);
  if (!promotion) throw new Error("Promotion plan not found");
  return promotion;
}

function getOptionalPromotion(db: DatabaseSync, id: number): PromotionPlan | null {
  const row = db.prepare(`${selectPromotion} WHERE plans.id = ?`).get(id) as PromotionPlanRow | undefined;
  return row ? mapPromotionPlan(row) : null;
}

function mapPromotionPlan(row: PromotionPlanRow): PromotionPlan {
  return {
    id: row.id,
    orgId: row.org_id,
    storeId: row.store_id,
    storeName: row.store_name,
    productId: row.product_id,
    sku: row.sku,
    asin: row.asin,
    brand: row.brand,
    name: row.name,
    type: row.type as PromotionPlanType,
    marketplace: row.marketplace,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as PromotionPlanStatus,
    targetPrice: row.target_price,
    budget: row.budget,
    inventoryTarget: row.inventory_target,
    notes: row.notes,
    preparationTaskId: row.preparation_task_id,
    reviewTaskId: row.review_task_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
