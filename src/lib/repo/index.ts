// Repository abstraction over the evidence store.
//
// The inspection engine and API routes depend on this interface, never on a
// concrete store. `fileRepo` wraps the local filesystem store ([store.ts]) and
// is the dev/offline default. A `cloudflareRepo` (D1 for records, R2 for photos)
// will be added for the Workers deployment — it slots in here without the engine
// changing, because the local `fs`-based store cannot run on Workers.

import * as fileStore from "../store";
import { cloudflareRepo } from "./cloudflareRepo";
import type { CatalogEntry, EvidenceRecord } from "../types";

export interface Repository {
  saveRecord(record: EvidenceRecord): Promise<void>;
  getRecord(id: string): Promise<EvidenceRecord | null>;
  listRecords(): Promise<EvidenceRecord[]>;
  savePhoto(recordId: string, index: number, mediaType: string, buf: Buffer): Promise<string>;
  readPhoto(storedPath: string): Promise<Buffer | null>;
  // Catalog
  listCatalog(): Promise<CatalogEntry[]>;
  getCatalogBySku(sku: string): Promise<CatalogEntry | null>;
  findCatalogByCode(code: string): Promise<CatalogEntry | null>;
  upsertCatalog(entries: CatalogEntry[]): Promise<number>;
}

// Local filesystem implementation — wraps the existing synchronous store with
// the async Repository contract. Dev/offline only; not deployable to Workers.
const fileRepo: Repository = {
  async saveRecord(record) {
    fileStore.saveRecord(record);
  },
  async getRecord(id) {
    return fileStore.getRecord(id);
  },
  async listRecords() {
    return fileStore.readAll();
  },
  async savePhoto(recordId, index, mediaType, buf) {
    return fileStore.savePhoto(recordId, index, mediaType, buf);
  },
  async readPhoto(storedPath) {
    return fileStore.readPhoto(storedPath);
  },
  async listCatalog() {
    return fileStore.readCatalog();
  },
  async getCatalogBySku(sku) {
    return fileStore.getCatalogBySku(sku);
  },
  async findCatalogByCode(code) {
    return fileStore.findCatalogByCode(code);
  },
  async upsertCatalog(entries) {
    return fileStore.upsertCatalog(entries);
  },
};

// True only inside the Cloudflare Workers runtime (production and the
// `opennextjs-cloudflare preview` local worker). Plain `next dev` runs on Node,
// where navigator is undefined, so it keeps the file repo and the local data/
// store untouched.
function isWorkersRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

// Select the active repository. `OPSCONSOLE_STORE` forces a choice ("file" |
// "cloudflare"); otherwise the runtime decides — Cloudflare on Workers, file on
// Node. The engine and routes depend only on the interface, never on which one.
export function getRepository(): Repository {
  const forced = (process.env.OPSCONSOLE_STORE || "").toLowerCase();
  if (forced === "file") return fileRepo;
  if (forced === "cloudflare") return cloudflareRepo;
  return isWorkersRuntime() ? cloudflareRepo : fileRepo;
}
