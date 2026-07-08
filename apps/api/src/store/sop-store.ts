import type { DatabaseSync } from "node:sqlite";
import type { CreateSopInput, Sop } from "@amazon-monitor/shared";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";
import { insertSop, mapSop, type SopRow } from "./workflow-mappers.js";

type SopStoreMethods = Pick<
  Store,
  | "createSop"
  | "updateSop"
  | "getSop"
  | "listSops"
  | "publishSop"
  | "archiveSop"
>;

function isCategory(value: string): value is Sop["category"] {
  return [
    "competitor_response",
    "price_action",
    "ad_optimization",
    "listing_optimization",
    "review_response",
    "inventory_replenishment",
    "supplier_negotiation",
    "general"
  ].includes(value);
}

export function createSopStore(db: DatabaseSync): SopStoreMethods {
  return {
    createSop(input: CreateSopInput) {
      const category: Sop["category"] = isCategory(input.category) ? input.category : "general";
      let created: Sop | null = null;
      withTransaction(db, () => {
        if (input.sourceTaskId !== undefined && input.sourceTaskId !== null) {
          const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(input.sourceTaskId);
          if (!task) {
            throw new Error(`Task ${input.sourceTaskId} not found`);
          }
        }
        const row = insertSop(db, {
          orgId: input.orgId,
          title: input.title,
          category,
          bodyMd: input.bodyMd,
          sourceTaskId: input.sourceTaskId ?? null,
          status: "draft",
          tagsJson: JSON.stringify(input.tags ?? []),
          createdBy: input.createdBy ?? null
        });
        created = mapSop(row);
        if (input.sourceTaskId !== undefined && input.sourceTaskId !== null) {
          db.prepare("UPDATE tasks SET promoted_to_sop_id = ?, updated_at = ? WHERE id = ?")
            .run(row.id, nowIso(), input.sourceTaskId);
        }
      });
      if (!created) {
        throw new Error("Failed to create SOP");
      }
      return created;
    },

    updateSop(id, input) {
      const current = db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow | undefined;
      if (!current) {
        throw new Error(`SOP ${id} not found`);
      }
      const next = {
        title: input.title ?? current.title,
        category: input.category && isCategory(input.category) ? input.category : current.category,
        body_md: input.bodyMd ?? current.body_md,
        status: input.status ?? current.status,
        tags_json: input.tags ? JSON.stringify(input.tags) : current.tags_json,
        updated_at: nowIso()
      };
      db.prepare(
        `UPDATE sops SET title = ?, category = ?, body_md = ?, status = ?, tags_json = ?, updated_at = ? WHERE id = ?`
      ).run(next.title, next.category, next.body_md, next.status, next.tags_json, next.updated_at, id);
      return mapSop(db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow);
    },

    getSop(id) {
      const row = db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow | undefined;
      return row ? mapSop(row) : null;
    },

    listSops(filter) {
      const where: string[] = ["1=1"];
      const params: Array<string | number> = [];
      if (filter?.status) {
        where.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.category) {
        where.push("category = ?");
        params.push(filter.category);
      }
      if (filter?.q) {
        where.push("(title LIKE ? OR body_md LIKE ?)");
        const like = `%${filter.q}%`;
        params.push(like, like);
      }
      const limit = filter?.limit ?? 200;
      const offset = filter?.offset ?? 0;
      const rows = db
        .prepare(`SELECT * FROM sops WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as SopRow[];
      return rows.map(mapSop);
    },

    publishSop(id) {
      const current = db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow | undefined;
      if (!current) {
        throw new Error(`SOP ${id} not found`);
      }
      db.prepare("UPDATE sops SET status = 'published', updated_at = ? WHERE id = ?")
        .run(nowIso(), id);
      return mapSop(db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow);
    },

    archiveSop(id) {
      const current = db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow | undefined;
      if (!current) {
        throw new Error(`SOP ${id} not found`);
      }
      db.prepare("UPDATE sops SET status = 'archived', updated_at = ? WHERE id = ?")
        .run(nowIso(), id);
      return mapSop(db.prepare("SELECT * FROM sops WHERE id = ?").get(id) as unknown as SopRow);
    }
  };
}
