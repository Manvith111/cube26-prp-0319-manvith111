// Cloudflare implementation of the Repository contract.
//
// Records + catalog live in D1 (serverless SQLite); photos live in R2
// (zero-egress object storage). The full EvidenceRecord / CatalogEntry JSON is
// stored in a `data` column so the shape is byte-for-byte identical to the file
// repo — "same evidence in → same verdict out" holds across datastores. Bindings
// are resolved per call via `getCloudflareContext().env`, which only exists in
// the Workers runtime; this module's methods are never invoked under `next dev`
// (the file repo is selected there — see index.ts).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CatalogEntry, EvidenceRecord } from "../types";
import { extForMediaType, normalizeCode } from "../store";
import type { Repository } from ".";

interface DataRow {
  data: string;
}

function bindings(): CloudflareEnv {
  return getCloudflareContext().env;
}

function parse<T>(row: DataRow | null): T | null {
  return row ? (JSON.parse(row.data) as T) : null;
}

export const cloudflareRepo: Repository = {
  async saveRecord(record) {
    await bindings()
      .DB.prepare(
        `INSERT OR REPLACE INTO evidence_records
           (id, created_at, manager, sku, org_id, warehouse_id, station_id,
            operator_id, rule_pack_id, rule_pack_version, overall_status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.createdAt,
        record.manager,
        record.product.sku,
        record.orgId ?? null,
        record.warehouseId ?? null,
        record.stationId ?? null,
        record.operatorId ?? null,
        record.rulePack?.id ?? null,
        record.rulePack?.version ?? null,
        record.overall.status,
        JSON.stringify(record),
      )
      .run();
  },

  async getRecord(id) {
    const row = await bindings()
      .DB.prepare(`SELECT data FROM evidence_records WHERE id = ?`)
      .bind(id)
      .first<DataRow>();
    return parse<EvidenceRecord>(row);
  },

  async listRecords() {
    const rs = await bindings()
      .DB.prepare(`SELECT data FROM evidence_records ORDER BY created_at DESC`)
      .all<DataRow>();
    return (rs.results ?? []).map((r) => JSON.parse(r.data) as EvidenceRecord);
  },

  async savePhoto(recordId, index, mediaType, buf) {
    const key = `photos/${recordId}/${index}.${extForMediaType(mediaType)}`;
    await bindings().PHOTOS.put(key, buf, {
      httpMetadata: { contentType: mediaType },
    });
    return key;
  },

  async readPhoto(storedPath) {
    const obj = await bindings().PHOTOS.get(storedPath);
    if (!obj) return null;
    return Buffer.from(await obj.arrayBuffer());
  },

  async listCatalog() {
    const rs = await bindings()
      .DB.prepare(`SELECT data FROM catalog ORDER BY updated_at DESC`)
      .all<DataRow>();
    return (rs.results ?? []).map((r) => JSON.parse(r.data) as CatalogEntry);
  },

  async getCatalogBySku(sku) {
    const row = await bindings()
      .DB.prepare(`SELECT data FROM catalog WHERE sku = ?`)
      .bind(sku)
      .first<DataRow>();
    return parse<CatalogEntry>(row);
  },

  async findCatalogByCode(code) {
    const norm = normalizeCode(code);
    if (!norm) return null;
    const row = await bindings()
      .DB.prepare(
        `SELECT data FROM catalog
         WHERE sku_norm = ?1 OR fnsku_norm = ?1 OR upc_norm = ?1
         LIMIT 1`,
      )
      .bind(norm)
      .first<DataRow>();
    return parse<CatalogEntry>(row);
  },

  async upsertCatalog(entries) {
    if (entries.length === 0) return 0;
    const db = bindings().DB;
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO catalog
         (sku, sku_norm, fnsku_norm, upc_norm, upc, expected_fnsku,
          rule_pack_id, rule_pack_version, updated_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const batch = entries.map((e) =>
      stmt.bind(
        e.sku,
        normalizeCode(e.sku),
        e.product.expectedFnsku ? normalizeCode(e.product.expectedFnsku) : null,
        e.upc ? normalizeCode(e.upc) : null,
        e.upc ?? null,
        e.product.expectedFnsku ?? null,
        e.rulePackId,
        e.rulePackVersion,
        e.updatedAt,
        JSON.stringify(e),
      ),
    );
    await db.batch(batch);
    return entries.length;
  },
};
