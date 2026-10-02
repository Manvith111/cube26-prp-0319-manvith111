import { NextResponse } from "next/server";
import { findProduct, type FindPhoto } from "@/lib/find";

export const runtime = "nodejs";
export const maxDuration = 60;

interface FindBody {
  photos: FindPhoto[];
}

// POST { photos: [{ mediaType, dataBase64 }] }
//   → { match, candidates, extracted, available, note? }
// The "find agent": the AI reads the product's codes + description, then the
// catalog is searched across SKU / FNSKU / UPC / name / category for the match.
export async function POST(req: Request) {
  let body: FindBody;
  try {
    body = (await req.json()) as FindBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const photos = Array.isArray(body?.photos) ? body.photos : [];
  if (photos.length === 0) {
    return NextResponse.json({ error: "At least one photo is required" }, { status: 400 });
  }
  const result = await findProduct(photos);
  return NextResponse.json(result);
}
