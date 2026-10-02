import { NextResponse } from "next/server";
import { runInspection, type InspectionPhotoUpload } from "@/lib/inspection";
import type { ProductInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface InspectBody {
  product: ProductInput;
  photos: InspectionPhotoUpload[];
  shipmentId?: string;
  unitId?: string;
  notes?: string;
  rulePackId?: string;
  rulePackVersion?: string;
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

  const photos = Array.isArray(body.photos) ? body.photos : [];
  try {
    const record = await runInspection(body.product, photos, {
      shipmentId: body.shipmentId,
      unitId: body.unitId,
      notes: body.notes,
      rulePackId: body.rulePackId,
      rulePackVersion: body.rulePackVersion,
    });
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Inspection failed" },
      { status: 400 },
    );
  }
}
