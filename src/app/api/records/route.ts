import { NextResponse } from "next/server";
import { readAll } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(readAll());
}
