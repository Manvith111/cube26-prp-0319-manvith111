import { NextResponse } from "next/server";
import { readAll } from "@/lib/store";
import { classifyCharges, type FeeCharge } from "@/lib/recovery";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { charges?: FeeCharge[] };
  try {
    body = (await req.json()) as { charges?: FeeCharge[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const charges = Array.isArray(body.charges) ? body.charges : [];
  const out = classifyCharges(charges, readAll());
  return NextResponse.json(out);
}
