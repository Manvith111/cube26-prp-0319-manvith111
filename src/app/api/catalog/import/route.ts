import { NextResponse } from "next/server";
import { parseCatalog } from "@/lib/catalogImport";
import { getRepository } from "@/lib/repo";

export const runtime = "nodejs";

interface ImportBody {
  filename?: string;
  content?: string;
}

export async function POST(req: Request) {
  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "No file content provided" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseCatalog(body.filename || "upload.csv", content);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not parse file" },
      { status: 400 },
    );
  }

  const repo = getRepository();
  if (parsed.entries.length > 0) await repo.upsertCatalog(parsed.entries);

  return NextResponse.json({
    accepted: parsed.accepted,
    rejected: parsed.rejected,
    total: parsed.results.length,
    results: parsed.results,
  });
}
