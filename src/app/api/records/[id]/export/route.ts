import { getRecord } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRecord(id);
  if (!rec) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(rec, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${id}.json"`,
    },
  });
}
