import { getRecord, readPhoto } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await params;
  const rec = getRecord(id);
  if (!rec) return new Response("Not found", { status: 404 });
  const photo = rec.photos.find((p) => String(p.index) === index);
  if (!photo) return new Response("Not found", { status: 404 });
  const buf = readPhoto(photo.storedPath);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": photo.mediaType, "Cache-Control": "no-store" },
  });
}
