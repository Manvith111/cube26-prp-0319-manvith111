import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repo";

export const runtime = "nodejs";

// GET /api/catalog            → list all catalog rows
// GET /api/catalog?sku=XXX    → one row by SKU
// GET /api/catalog?code=XXX   → one row by scanned/typed code (SKU, FNSKU, or UPC)
export async function GET(req: Request) {
  const repo = getRepository();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const sku = searchParams.get("sku");

  if (code) {
    const entry = await repo.findCatalogByCode(code);
    if (!entry) return NextResponse.json({ error: "No catalog match for that code" }, { status: 404 });
    return NextResponse.json(entry);
  }
  if (sku) {
    const entry = await repo.getCatalogBySku(sku);
    if (!entry) return NextResponse.json({ error: "No catalog match for that SKU" }, { status: 404 });
    return NextResponse.json(entry);
  }

  const entries = await repo.listCatalog();
  return NextResponse.json({ entries, total: entries.length });
}
