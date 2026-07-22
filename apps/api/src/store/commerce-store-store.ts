import type { DatabaseSync } from "node:sqlite";
import type {
  CommerceStore,
  CommerceStoreAuthStatus,
  CommerceStorePlatform,
  CommerceStoreStatus,
  UpdateCommerceStoreInput
} from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type CommerceStoreMethods = Pick<Store, "createCommerceStore" | "updateCommerceStore" | "getCommerceStore" | "listCommerceStores">;

interface CommerceStoreRow {
  id: number;
  org_id: number;
  name: string;
  platform: string;
  marketplace: string;
  seller_id: string;
  auth_status: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function createCommerceStoreStore(db: DatabaseSync): CommerceStoreMethods {
  return {
    createCommerceStore(input) {
      const now = nowIso();
      const result = db.prepare(
        `INSERT INTO commerce_stores
         (org_id, name, platform, marketplace, seller_id, auth_status, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.orgId,
        input.name,
        input.platform ?? "amazon",
        input.marketplace,
        input.sellerId,
        input.authStatus ?? "not_connected",
        input.status ?? "active",
        now,
        now
      );
      return getRequiredStore(db, Number(result.lastInsertRowid));
    },

    updateCommerceStore(id, input: UpdateCommerceStoreInput) {
      const existing = this.getCommerceStore(id);
      if (!existing) return null;
      db.prepare(
        `UPDATE commerce_stores SET
          name = ?, platform = ?, marketplace = ?, seller_id = ?, auth_status = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.name ?? existing.name,
        input.platform ?? existing.platform,
        input.marketplace ?? existing.marketplace,
        input.sellerId ?? existing.sellerId,
        input.authStatus ?? existing.authStatus,
        input.status ?? existing.status,
        nowIso(),
        id
      );
      return this.getCommerceStore(id);
    },

    getCommerceStore(id) {
      const row = db.prepare("SELECT * FROM commerce_stores WHERE id = ?").get(id) as unknown as CommerceStoreRow | undefined;
      return row ? mapCommerceStore(row) : null;
    },

    listCommerceStores(filter = {}) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("marketplace", filter.marketplace),
        whereEq("status", filter.status),
        qWhere(filter.q)
      );
      const limit = clampLimit(filter.limit ?? 100);
      const offset = clampOffset(filter.offset);
      const rows = db.prepare(
        `SELECT * FROM commerce_stores ${sql}
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name ASC, id ASC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset) as unknown as CommerceStoreRow[];
      return rows.map(mapCommerceStore);
    }
  };
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(name) LIKE ? OR LOWER(seller_id) LIKE ? OR LOWER(marketplace) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function getRequiredStore(db: DatabaseSync, id: number): CommerceStore {
  const row = db.prepare("SELECT * FROM commerce_stores WHERE id = ?").get(id) as unknown as CommerceStoreRow;
  return mapCommerceStore(row);
}

function mapCommerceStore(row: CommerceStoreRow): CommerceStore {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    platform: mapPlatform(row.platform),
    marketplace: row.marketplace,
    sellerId: row.seller_id,
    authStatus: mapAuthStatus(row.auth_status),
    status: mapStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPlatform(value: string): CommerceStorePlatform {
  return value === "amazon" ? value : "amazon";
}

function mapAuthStatus(value: string): CommerceStoreAuthStatus {
  if (value === "connected" || value === "attention" || value === "expired") return value;
  return "not_connected";
}

function mapStatus(value: string): CommerceStoreStatus {
  return value === "paused" ? value : "active";
}
