// Find agent: identify which catalog product a photo shows.
//
// The AI (observe-only) reads whatever is visible — codes (FNSKU/UPC/SKU) plus
// the product name, brand and descriptive keywords — and a deterministic scorer
// searches the catalog across all of those fields, so a unit is matched even
// when no barcode decodes. Judging still happens later against the matched
// product's own criteria; this step only resolves identity.

import { z } from "zod";
import { callAi, NoCredentialsError } from "./ai";
import { getRepository } from "./repo";
import { normalizeCode } from "./store";
import { extractJson, type PhotoInput } from "./vision";
import type { CatalogEntry } from "./types";

const extractSchema = z.object({
  codes: z.array(z.string()).default([]),
  name: z.string().default(""),
  brand: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});

export type ExtractedDetails = z.infer<typeof extractSchema>;

export interface FindPhoto {
  mediaType: string;
  dataBase64: string;
}

export interface FindCandidate {
  sku: string;
  name: string;
  score: number;
}

export interface FindResult {
  match: CatalogEntry | null;
  candidates: FindCandidate[];
  extracted: ExtractedDetails | null;
  available: boolean; // false when the AI call couldn't run (e.g. quota/key)
  note?: string;
  model: string;
}

const MATCH_THRESHOLD = 16; // an exact code (100) clears this; so do 2+ text hits

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function scoreEntry(entry: CatalogEntry, data: ExtractedDetails): number {
  let score = 0;
  const codes = data.codes.map(normalizeCode).filter(Boolean);
  const fields = [entry.sku, entry.product.expectedFnsku, entry.upc]
    .filter((x): x is string => Boolean(x))
    .map(normalizeCode);

  if (codes.some((c) => fields.includes(c))) {
    score += 100; // exact code match
  } else if (codes.some((c) => c.length >= 5 && fields.some((f) => f.includes(c) || c.includes(f)))) {
    score += 50; // partial code (AI read part of the number)
  }

  const hay = `${entry.product.name} ${entry.sku} ${entry.product.category}`.toLowerCase();
  const terms = new Set<string>([
    ...tokenize(data.name),
    ...tokenize(data.brand),
    ...data.keywords.flatMap(tokenize),
  ]);
  for (const t of terms) if (hay.includes(t)) score += 8;

  return score;
}

async function extractDetails(photos: FindPhoto[]): Promise<{ data: ExtractedDetails; model: string }> {
  const system = [
    "You identify a product from photos so a warehouse system can look it up in its catalog.",
    "Report ONLY what you can actually see — codes read character for character, text as printed. Never guess or invent.",
    "Output ONLY a single JSON object. No prose, no markdown.",
  ].join("\n");
  const userText = [
    "From these photos, extract for catalog search:",
    "- codes: every identifying code you can read (FNSKU like X001ABC123; UPC/EAN/Code-128 digits like 1490837295051823; any printed SKU/order code)",
    "- name: the product name/title as printed",
    "- brand: the brand or seller, if shown",
    "- keywords: 3-8 descriptive words (type, colour, size, material)",
    'Return JSON exactly: { "codes": [], "name": "", "brand": "", "keywords": [] }. Use empty values for anything not legible.',
  ].join("\n");
  const inPhotos: PhotoInput[] = photos.map((p, i) => ({
    index: i + 1,
    mediaType: p.mediaType || "image/jpeg",
    dataBase64: p.dataBase64,
  }));
  const result = await callAi(system, userText, inPhotos);
  return { data: extractSchema.parse(extractJson(result.text)), model: `${result.provider}:${result.model}` };
}

export async function findProduct(photos: FindPhoto[]): Promise<FindResult> {
  if (photos.length === 0) {
    return { match: null, candidates: [], extracted: null, available: false, note: "No photos provided.", model: "none" };
  }

  let extracted: ExtractedDetails;
  let model = "none";
  try {
    const out = await extractDetails(photos);
    extracted = out.data;
    model = out.model;
  } catch (e) {
    const note = e instanceof NoCredentialsError ? "No AI provider configured." : e instanceof Error ? e.message : String(e);
    return { match: null, candidates: [], extracted: null, available: false, note, model: "none" };
  }

  const catalog = await getRepository().listCatalog();
  const scored = catalog
    .map((entry) => ({ entry, score: scoreEntry(entry, extracted) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const match = scored.length > 0 && scored[0].score >= MATCH_THRESHOLD ? scored[0].entry : null;
  const candidates = scored.slice(0, 5).map((c) => ({ sku: c.entry.sku, name: c.entry.product.name, score: c.score }));

  return { match, candidates, extracted, available: true, model };
}
