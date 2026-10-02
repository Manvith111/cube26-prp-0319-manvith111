// The inspection engine — the single entry point every capture path shares.
//
// Manual photo upload (/api/inspect), browser auto-capture (/capture), and the
// enterprise queue consumer all call `runInspection()`. It runs the AI
// observation ([vision.observe]) and the deterministic rules engine
// ([rules.evaluate]), persists photos + the evidence record through the active
// Repository, and returns the record. "AI observes, rules decide" is unchanged:
// this function only orchestrates ingress and persistence around that core.

import { observe, type PhotoInput } from "./vision";
import { evaluate } from "./rules";
import { newId, sha256 } from "./store";
import { getRepository } from "./repo";
import { getRulePack } from "./rulePacks";
import type { EvidenceRecord, PhotoMeta, ProductInput } from "./types";

const MAX_PHOTOS = 6;
const DEFAULT_MEDIA_TYPE = "image/jpeg";

export interface InspectionPhotoUpload {
  filename: string;
  mediaType: string;
  dataBase64: string;
}

export interface InspectionMeta {
  shipmentId?: string;
  unitId?: string;
  notes?: string;
  orgId?: string;
  warehouseId?: string;
  stationId?: string;
  operatorId?: string;
  rulePackId?: string;
  rulePackVersion?: string;
}

/**
 * Run a full prep inspection and persist it as an EvidenceRecord.
 * Deterministic given the same photos + model observations.
 */
export async function runInspection(
  product: ProductInput,
  photos: InspectionPhotoUpload[],
  meta: InspectionMeta = {},
): Promise<EvidenceRecord> {
  const repo = getRepository();
  const pack = getRulePack(meta.rulePackId, meta.rulePackVersion);
  const limited = photos.slice(0, MAX_PHOTOS);

  const photoInputs: PhotoInput[] = limited.map((p, i) => ({
    index: i + 1,
    mediaType: p.mediaType || DEFAULT_MEDIA_TYPE,
    dataBase64: p.dataBase64,
  }));

  const vision = await observe(product, photoInputs, pack);
  const { checks, overall } = evaluate(product, vision, pack);

  const id = newId();
  const photoMetas: PhotoMeta[] = await Promise.all(
    limited.map(async (p, i) => {
      const mediaType = p.mediaType || DEFAULT_MEDIA_TYPE;
      const buf = Buffer.from(p.dataBase64, "base64");
      const storedPath = await repo.savePhoto(id, i + 1, mediaType, buf);
      return {
        index: i + 1,
        filename: p.filename || `photo-${i + 1}`,
        mediaType,
        sha256: sha256(buf),
        storedPath,
      };
    }),
  );

  const record: EvidenceRecord = {
    id,
    manager: "prep",
    createdAt: new Date().toISOString(),
    product,
    shipmentId: meta.shipmentId || undefined,
    unitId: meta.unitId || undefined,
    notes: meta.notes || undefined,
    orgId: meta.orgId || undefined,
    warehouseId: meta.warehouseId || undefined,
    stationId: meta.stationId || undefined,
    operatorId: meta.operatorId || undefined,
    rulePack: { id: pack.id, version: pack.version, source: pack.source },
    photos: photoMetas,
    checks,
    overall,
    vision: {
      model: vision.model,
      available: vision.available,
      note: vision.note,
      raw: vision.raw,
    },
  };

  await repo.saveRecord(record);
  return record;
}
