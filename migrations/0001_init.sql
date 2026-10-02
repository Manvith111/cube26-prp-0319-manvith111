-- OpsConsole D1 schema (Phase 0).
--
-- Mirrors the file store: the full EvidenceRecord / CatalogEntry is kept as JSON
-- in `data`, so the shape stays identical across the file and Cloudflare repos.
-- The extracted columns exist only for indexed querying (dashboards, lookups).

CREATE TABLE IF NOT EXISTS evidence_records (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  manager           TEXT NOT NULL,
  sku               TEXT,
  org_id            TEXT,
  warehouse_id      TEXT,
  station_id        TEXT,
  operator_id       TEXT,
  rule_pack_id      TEXT,
  rule_pack_version TEXT,
  overall_status    TEXT,
  data              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_created_at ON evidence_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_sku        ON evidence_records (sku);
CREATE INDEX IF NOT EXISTS idx_records_org        ON evidence_records (org_id);
CREATE INDEX IF NOT EXISTS idx_records_station    ON evidence_records (station_id);

-- Catalog: product criteria + the rule pack each SKU is judged against.
-- Normalized columns (uppercase, alphanumeric-only) back the scan/code lookup.
CREATE TABLE IF NOT EXISTS catalog (
  sku               TEXT PRIMARY KEY,
  sku_norm          TEXT NOT NULL,
  fnsku_norm        TEXT,
  upc_norm          TEXT,
  upc               TEXT,
  expected_fnsku    TEXT,
  rule_pack_id      TEXT NOT NULL,
  rule_pack_version TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  data              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_sku_norm   ON catalog (sku_norm);
CREATE INDEX IF NOT EXISTS idx_catalog_fnsku_norm ON catalog (fnsku_norm);
CREATE INDEX IF NOT EXISTS idx_catalog_upc_norm   ON catalog (upc_norm);
