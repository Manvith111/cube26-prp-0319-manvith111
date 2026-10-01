// AI observation step.
//
// Gemini is used ONLY to describe what is visible in the photos. It never
// emits a verdict — it returns met / not_met / cant_tell per check, a
// confidence, which photo + where, the visible evidence, a usability rating
// per photo, and a literal transcription of the FNSKU label. The deterministic
// rules engine (rules.ts) turns these observations into verdicts.

import { z } from "zod";
import { CHECK_CATALOG, RULE_CLAUSES } from "./prepRequirements";
import { getGeminiApiKey, getVisionModel } from "./settings";
import type { CheckId, ProductInput, VisionResult } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// When the chosen model is temporarily overloaded, fall back to this one so a
// transient "high demand" spike doesn't fail the whole inspection.
const FALLBACK_MODEL = "gemini-flash-lite-latest";

// Errors that would fail on every model (bad/missing key, permission, blocked
// content) — no point trying the fallback model. Everything else (overload,
// deprecated model, parse hiccup, empty response) is worth a fallback attempt.
function failsEverywhere(message: string): boolean {
  return /api[_ ]?key|api_key_invalid|permission|permission_denied|unauthor|\b401\b|\b403\b|blocked|safety/i.test(
    message,
  );
}

const confidence = z.enum(["high", "medium", "low"]);

const visionSchema = z.object({
  photo_quality: z
    .array(
      z.object({
        photo_index: z.number(),
        usable: z.boolean(),
        issues: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  label_text_read: z.object({
    value: z.string().nullable(),
    photo_index: z.number().nullable(),
    legible: z.boolean(),
    confidence,
  }),
  observations: z
    .array(
      z.object({
        check_id: z.string(),
        status: z.enum(["met", "not_met", "cant_tell"]),
        confidence,
        photo_index: z.number().nullable(),
        location: z.string().default(""),
        evidence: z.string().default(""),
      }),
    )
    .default([]),
});

export interface PhotoInput {
  index: number;
  mediaType: string;
  dataBase64: string;
}

const KNOWN_CHECK_IDS = new Set(CHECK_CATALOG.map((c) => c.id));

function applicableObservable(product: ProductInput) {
  // Checks the AI should observe: verifiable, apply to the product, and not
  // the derived text-match check (that comes from label_text_read).
  return CHECK_CATALOG.filter(
    (c) => c.verifiable && c.id !== "fnsku_text_match" && c.appliesTo(product),
  );
}

function buildPrompt(product: ProductInput): { system: string; userText: string } {
  const checks = applicableObservable(product);
  const checklist = checks
    .map((c) => `  - "${c.id}" — ${c.name}. Rule: ${RULE_CLAUSES[c.clauseKey].quote}`)
    .join("\n");

  const system = [
    "You are the OBSERVATION component of an automated warehouse prep-inspection system.",
    "Your ONLY job is to report, strictly and literally, what is visible in the photographs.",
    "You do NOT decide pass or fail — a separate deterministic rules engine does that from your observations.",
    "",
    "Hard rules:",
    "1. Describe only what you can actually see. Never assume, infer, or guess what is likely.",
    '2. For each check choose status: "met" (you can clearly SEE the requirement satisfied), "not_met" (you can clearly SEE it violated or absent), or "cant_tell" (the area is not shown, is blurry/glary/cropped/dark, or you are unsure). When in any doubt, use "cant_tell".',
    '3. Use confidence "high" only when the relevant area is clearly visible and in focus; use "low" if anything is ambiguous.',
    '4. Cite which photo (photo_index, starting at 1) and where in it (location, e.g. "lower-right corner"). If the area is not shown in any photo, use "cant_tell" with photo_index null.',
    '5. The "evidence" field must describe the specific visible thing you based the status on. If you cannot point to something visible, use "cant_tell" with empty evidence.',
    "6. For the label, transcribe the FNSKU/barcode text EXACTLY as printed. If unreadable, set legible=false and value null. Never invent or auto-correct characters.",
    "7. Rate each photo usable=false if it is blurry, glary, cropped, too dark, out of frame, or too low-resolution to judge; list the issues.",
    "8. Output ONLY a single JSON object. No prose, no markdown fences.",
  ].join("\n");

  const example = `{
  "photo_quality": [
    { "photo_index": 1, "usable": true, "issues": [] },
    { "photo_index": 2, "usable": false, "issues": ["blurry", "glare"] }
  ],
  "label_text_read": { "value": "X001ABC123", "photo_index": 3, "legible": true, "confidence": "high" },
  "observations": [
    { "check_id": "polybag_present", "status": "met", "confidence": "high", "photo_index": 1, "location": "whole frame", "evidence": "The product is fully enclosed in a clear poly bag; all four sealed edges are visible." }
  ]
}`;

  const userText = [
    `Product: ${product.name} (SKU ${product.sku}, category ${product.category}).`,
    `Expected FNSKU label text: ${product.expectedFnsku}.`,
    "Photos follow in order; photo_index starts at 1.",
    "",
    "Observe these checks (use these exact check_id values):",
    checklist,
    "",
    "Also: read the FNSKU label text, and rate every photo's usability.",
    "",
    "Return JSON exactly in this shape (values are illustrative):",
    example,
  ].join("\n");

  return { system, userText };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

function emptyResult(
  product: ProductInput,
  photos: PhotoInput[],
  model: string,
  note: string,
  raw = "",
): VisionResult {
  return {
    photoQuality: photos.map((p) => ({ photoIndex: p.index, usable: false, issues: ["observation_unavailable"] })),
    labelRead: { value: null, photoIndex: null, legible: false, confidence: "low" },
    observations: applicableObservable(product).map((c) => ({
      checkId: c.id,
      status: "cant_tell" as const,
      confidence: "low" as const,
      photoIndex: null,
      location: "",
      evidence: "",
    })),
    raw,
    model,
    available: false,
    note,
  };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  photos: PhotoInput[],
): Promise<string> {
  const parts = [
    ...photos.map((p) => ({
      inline_data: { mime_type: p.mediaType || "image/jpeg", data: p.dataBase64 },
    })),
    { text: userText },
  ];

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${msg}`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function observe(product: ProductInput, photos: PhotoInput[]): Promise<VisionResult> {
  const model = getVisionModel();
  if (photos.length === 0) return emptyResult(product, photos, model, "No photos were provided.");

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return emptyResult(
      product,
      photos,
      model,
      "AI vision unavailable: no Gemini API key configured. Add one on the Settings page (or set GEMINI_API_KEY).",
    );
  }

  const { system, userText } = buildPrompt(product);

  // Try the chosen model, then (only on a transient/capacity error) the fallback.
  const candidates = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];

  let raw = "";
  let lastError = "Unknown observation failure.";
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        raw = await callGemini(apiKey, candidate, system, userText, photos);
        const parsed = visionSchema.parse(extractJson(raw));
        return mapResult(parsed, candidate, raw);
      } catch (e) {
        lastError = describe(e);
        // Auth/permission/safety errors fail on every model — stop immediately.
        if (failsEverywhere(lastError)) {
          return emptyResult(product, photos, model, `AI observation failed: ${lastError}`, raw);
        }
        // Otherwise retry once on this model, then fall through to the fallback.
      }
    }
  }
  return emptyResult(product, photos, model, `AI observation failed: ${lastError}`, raw);
}

function mapResult(v: z.infer<typeof visionSchema>, model: string, raw: string): VisionResult {
  return {
    photoQuality: v.photo_quality.map((q) => ({
      photoIndex: q.photo_index,
      usable: q.usable,
      issues: q.issues,
    })),
    labelRead: {
      value: v.label_text_read.value,
      photoIndex: v.label_text_read.photo_index,
      legible: v.label_text_read.legible,
      confidence: v.label_text_read.confidence,
    },
    observations: v.observations
      .filter((o) => KNOWN_CHECK_IDS.has(o.check_id as CheckId))
      .map((o) => ({
        checkId: o.check_id as CheckId,
        status: o.status,
        confidence: o.confidence,
        photoIndex: o.photo_index,
        location: o.location,
        evidence: o.evidence,
      })),
    raw,
    model,
    available: true,
  };
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
