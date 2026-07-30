import type { DatabaseSync } from "node:sqlite";
import type { SpApiConnectionConfig, SpApiRegion } from "@amazon-monitor/shared";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

interface SpApiConnectionRow {
  data_source_id: number;
  org_id: number;
  region: string;
  credential_version: number;
  last_tested_at: string | null;
  updated_at: string;
}

export interface SpApiConnectionCredentials {
  dataSourceId: number;
  orgId: number;
  region: SpApiRegion;
  credentialVersion: number;
  keyVersion: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface ReplaceSpApiConnectionInput {
  orgId: number;
  dataSourceId: number;
  region: SpApiRegion;
  commerceStoreIds: number[];
  encryptedCredentials: {
    keyVersion: string;
    ciphertext: string;
    iv: string;
    authTag: string;
  };
}

type SpApiConnectionStoreMethods = Pick<
  Store,
  "getSpApiConnection" | "getSpApiConnectionCredentials" | "markSpApiConnectionTested" | "replaceSpApiConnection"
>;

export function createDataSourceSpApiStore(db: DatabaseSync): SpApiConnectionStoreMethods {
  return {
    getSpApiConnection(dataSourceId, orgId) {
      const row = db.prepare(
        `SELECT data_source_id, org_id, region, credential_version, last_tested_at, updated_at
         FROM sp_api_connections
         WHERE data_source_id = ? AND org_id = ?`
      ).get(dataSourceId, orgId) as unknown as SpApiConnectionRow | undefined;
      return row ? mapConnection(db, row) : null;
    },

    getSpApiConnectionCredentials(dataSourceId, orgId) {
      const row = db.prepare(
        `SELECT data_source_id, org_id, region, credential_version, key_version,
                credentials_ciphertext, credentials_iv, credentials_auth_tag
         FROM sp_api_connections
         WHERE data_source_id = ? AND org_id = ?`
      ).get(dataSourceId, orgId) as unknown as {
        data_source_id: number;
        org_id: number;
        region: string;
        credential_version: number;
        key_version: string;
        credentials_ciphertext: string;
        credentials_iv: string;
        credentials_auth_tag: string;
      } | undefined;
      if (!row) return null;
      return {
        dataSourceId: row.data_source_id,
        orgId: row.org_id,
        region: mapRegion(row.region),
        credentialVersion: row.credential_version,
        keyVersion: row.key_version,
        ciphertext: row.credentials_ciphertext,
        iv: row.credentials_iv,
        authTag: row.credentials_auth_tag
      };
    },

    markSpApiConnectionTested(dataSourceId, orgId) {
      const result = db.prepare(
        `UPDATE sp_api_connections SET last_tested_at = ?, updated_at = ?
         WHERE data_source_id = ? AND org_id = ?`
      ).run(nowIso(), nowIso(), dataSourceId, orgId);
      return result.changes > 0;
    },

    replaceSpApiConnection(input) {
      let connection: SpApiConnectionConfig | null = null;
      withTransaction(db, () => {
        const source = db.prepare(
          "SELECT id FROM data_source_configs WHERE id = ? AND org_id = ? AND source_type = 'amazon_sp_api'"
        ).get(input.dataSourceId, input.orgId) as { id: number } | undefined;
        if (!source) {
          throw Object.assign(new Error("SP-API data source not found"), { statusCode: 404 });
        }

        const linkedStores = getLinkedStores(db, input.commerceStoreIds, input.orgId);
        if (linkedStores.length !== input.commerceStoreIds.length) {
          throw Object.assign(new Error("Commerce store not found"), { statusCode: 404 });
        }

        const existing = db.prepare(
          "SELECT credential_version FROM sp_api_connections WHERE data_source_id = ?"
        ).get(input.dataSourceId) as { credential_version: number } | undefined;
        const credentialVersion = (existing?.credential_version ?? 0) + 1;
        const now = nowIso();
        db.prepare(
          `INSERT INTO sp_api_connections
           (data_source_id, org_id, region, credential_version, key_version, credentials_ciphertext,
            credentials_iv, credentials_auth_tag, last_tested_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
           ON CONFLICT(data_source_id) DO UPDATE SET
             org_id = excluded.org_id,
             region = excluded.region,
             credential_version = excluded.credential_version,
             key_version = excluded.key_version,
             credentials_ciphertext = excluded.credentials_ciphertext,
             credentials_iv = excluded.credentials_iv,
             credentials_auth_tag = excluded.credentials_auth_tag,
             last_tested_at = NULL,
             updated_at = excluded.updated_at`
        ).run(
          input.dataSourceId,
          input.orgId,
          input.region,
          credentialVersion,
          input.encryptedCredentials.keyVersion,
          input.encryptedCredentials.ciphertext,
          input.encryptedCredentials.iv,
          input.encryptedCredentials.authTag,
          now,
          now
        );
        db.prepare("DELETE FROM sp_api_connection_stores WHERE data_source_id = ?").run(input.dataSourceId);
        const insertStore = db.prepare(
          "INSERT INTO sp_api_connection_stores (data_source_id, commerce_store_id, created_at) VALUES (?, ?, ?)"
        );
        for (const store of linkedStores) {
          insertStore.run(input.dataSourceId, store.id, now);
        }
        connection = this.getSpApiConnection(input.dataSourceId, input.orgId);
        if (!connection) throw new Error("Failed to save SP-API connection");
      });
      if (!connection) throw new Error("Failed to save SP-API connection");
      return connection;
    }
  };
}

function getLinkedStores(
  db: DatabaseSync,
  storeIds: number[],
  orgId: number
): Array<{ id: number }> {
  if (storeIds.length === 0) return [];
  const placeholders = storeIds.map(() => "?").join(", ");
  return db.prepare(
    `SELECT id FROM commerce_stores WHERE org_id = ? AND id IN (${placeholders})`
  ).all(orgId, ...storeIds) as unknown as Array<{ id: number }>;
}

function mapConnection(db: DatabaseSync, row: SpApiConnectionRow): SpApiConnectionConfig {
  const linkedStoreIds = db.prepare(
    "SELECT commerce_store_id FROM sp_api_connection_stores WHERE data_source_id = ? ORDER BY commerce_store_id ASC"
  ).all(row.data_source_id) as unknown as Array<{ commerce_store_id: number }>;
  return {
    dataSourceId: row.data_source_id,
    orgId: row.org_id,
    region: mapRegion(row.region),
    credentialVersion: row.credential_version,
    credentialsConfigured: true,
    linkedStoreIds: linkedStoreIds.map((item) => item.commerce_store_id),
    lastTestedAt: row.last_tested_at,
    updatedAt: row.updated_at
  };
}

function mapRegion(value: string): SpApiRegion {
  if (value === "EU" || value === "FE") return value;
  return "NA";
}
