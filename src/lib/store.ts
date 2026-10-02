// File-backed evidence store. Records survive a restart.
// records.json holds EvidenceRecord[]; photos live under data/photos/<id>/.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { CatalogEntry, EvidenceRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");

function ensureDirs(): void {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function newId(): string {
  const stamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  return `PREP-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function extForMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export function readAll(): EvidenceRecord[] {
  ensureDirs();
  if (!fs.existsSync(RECORDS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RECORDS_FILE, "utf8")) as EvidenceRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: EvidenceRecord[]): void {
  ensureDirs();
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
}

export function getRecord(id: string): EvidenceRecord | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function saveRecord(record: EvidenceRecord): void {
  const all = readAll();
  all.unshift(record);
  writeAll(all);
}

export function savePhoto(recordId: string, index: number, mediaType: string, buf: Buffer): string {
  ensureDirs();
  const dir = path.join(PHOTOS_DIR, recordId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = extForMediaType(mediaType);
  const rel = `photos/${recordId}/${index}.${ext}`;
  fs.writeFileSync(path.join(DATA_DIR, rel), buf);
  return rel;
}

export function readPhoto(storedPath: string): Buffer | null {
  // Guard against path traversal — only serve files inside DATA_DIR.
  const abs = path.resolve(DATA_DIR, storedPath);
  if (!abs.startsWith(path.resolve(DATA_DIR))) return null;
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

// ---- Catalog (product list + per-SKU criteria) ----

export function normalizeCode(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function readCatalog(): CatalogEntry[] {
  ensureDirs();
  if (!fs.existsSync(CATALOG_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")) as CatalogEntry[];
  } catch {
    return [];
  }
}

function writeCatalog(entries: CatalogEntry[]): void {
  ensureDirs();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(entries, null, 2));
}

/** Upsert rows by SKU; returns the number of rows written. */
export function upsertCatalog(entries: CatalogEntry[]): number {
  const bySku = new Map(readCatalog().map((e) => [e.sku, e]));
  for (const e of entries) bySku.set(e.sku, e);
  writeCatalog([...bySku.values()]);
  return entries.length;
}

export function getCatalogBySku(sku: string): CatalogEntry | null {
  return readCatalog().find((e) => e.sku === sku) ?? null;
}

/** Match a scanned/typed code against SKU, expected FNSKU, or manufacturer UPC. */
export function findCatalogByCode(code: string): CatalogEntry | null {
  const norm = normalizeCode(code);
  if (!norm) return null;
  return (
    readCatalog().find(
      (e) =>
        normalizeCode(e.sku) === norm ||
        normalizeCode(e.product.expectedFnsku) === norm ||
        (e.upc ? normalizeCode(e.upc) === norm : false),
    ) ?? null
  );
}
