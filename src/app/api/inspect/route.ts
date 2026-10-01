import { NextResponse } from "next/server";
import { observe, type PhotoInput } from "@/lib/vision";
import { evaluate } from "@/lib/rules";
import { newId, savePhoto, sha256, saveRecord } from "@/lib/store";
import type { EvidenceRecord, PhotoMeta, ProductInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface InspectBody {
  product: ProductInput;
  photos: { filename: string; mediaType: string; dataBase64: string }[];
  shipmentId?: string;
  unitId?: string;
  notes?: string;
}

export async function POST(req: Request) {
  let body: InspectBody;
  try {
    body = (await req.json()) as InspectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.product?.sku) {
    return NextResponse.json({ error: "Product SKU is required" }, { status: 400 });
  }

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 6) : [];
  const photoInputs: PhotoInput[] = photos.map((p, i) => ({
    index: i + 1,
    mediaType: p.mediaType || "image/jpeg",
    dataBase64: p.dataBase64,
  }));

  const vision = await observe(body.product, photoInputs);
  const { checks, overall } = evaluate(body.product, vision);

  const id = newId();
  const photoMetas: PhotoMeta[] = photos.map((p, i) => {
    const buf = Buffer.from(p.dataBase64, "base64");
    const storedPath = savePhoto(id, i + 1, p.mediaType || "image/jpeg", buf);
    return {
      index: i + 1,
      filename: p.filename || `photo-${i + 1}`,
      mediaType: p.mediaType || "image/jpeg",
      sha256: sha256(buf),
      storedPath,
    };
  });

  const record: EvidenceRecord = {
    id,
    manager: "prep",
    createdAt: new Date().toISOString(),
    product: body.product,
    shipmentId: body.shipmentId || undefined,
    unitId: body.unitId || undefined,
    notes: body.notes || undefined,
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
  saveRecord(record);
  return NextResponse.json(record);
}
