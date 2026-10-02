// Client helper for the find agent: send captured frames, get back the matched
// catalog product (or candidates, or the reason the AI couldn't run).

import type { CatalogEntry } from "@/lib/types";

export interface FindCandidate {
  sku: string;
  name: string;
  score: number;
}

export interface FindResponse {
  match: CatalogEntry | null;
  candidates: FindCandidate[];
  extracted: { codes: string[]; name: string; brand: string; keywords: string[] } | null;
  available: boolean;
  note?: string;
  model: string;
}

export interface FindPhotoPayload {
  mediaType: string;
  dataBase64: string;
}

export async function findProductFromPhotos(photos: FindPhotoPayload[]): Promise<FindResponse> {
  try {
    const res = await fetch("/api/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos }),
    });
    if (!res.ok) {
      return { match: null, candidates: [], extracted: null, available: false, note: `Find failed (${res.status})`, model: "" };
    }
    return (await res.json()) as FindResponse;
  } catch (e) {
    return { match: null, candidates: [], extracted: null, available: false, note: e instanceof Error ? e.message : String(e), model: "" };
  }
}
