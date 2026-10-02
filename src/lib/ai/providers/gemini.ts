// Google Gemini provider (generativelanguage REST API).

import { AiError, type AiCredential, type PhotoInput, type ProviderDef } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: {
    message?: string;
    status?: string;
    details?: { retryDelay?: string }[];
  };
}

function retryAfterMs(data: GeminiResponse): number | undefined {
  const raw = data.error?.details?.find((d) => d.retryDelay)?.retryDelay;
  if (!raw) return undefined;
  const m = /([\d.]+)\s*(ms|s)?/.exec(raw);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return m[2] === "ms" ? Math.ceil(n) : Math.ceil(n * 1000);
}

async function generate(
  cred: AiCredential,
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
    generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
  };

  const res = await fetch(`${BASE}/${encodeURIComponent(cred.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": cred.apiKey },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || data.error?.status === "RESOURCE_EXHAUSTED") {
      throw new AiError("quota", `Gemini: ${msg}`, retryAfterMs(data));
    }
    if (res.status === 401 || res.status === 403) throw new AiError("auth", `Gemini: ${msg}`);
    throw new AiError("other", `Gemini: ${msg}`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new AiError("blocked", `Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n").trim();
  if (!text) throw new AiError("other", "Gemini returned an empty response.");
  return text;
}

async function test(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: "No API key to test." };
  try {
    const res = await fetch(BASE, { headers: { "X-goog-api-key": apiKey.trim() } });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; models?: unknown[] };
    if (!res.ok) return { ok: false, message: data.error?.message || `HTTP ${res.status}` };
    const count = Array.isArray(data.models) ? data.models.length : 0;
    return { ok: true, message: `Key is valid — ${count} models available.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const geminiProvider: ProviderDef = {
  id: "gemini",
  label: "Google Gemini",
  defaultModel: "gemini-2.5-flash",
  models: [
    { id: "gemini-flash-latest", label: "Gemini Flash (latest) — fast" },
    { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest) — cheapest, most available" },
    { id: "gemini-pro-latest", label: "Gemini Pro (latest) — most capable" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — stable" },
  ],
  keyHint: "aistudio.google.com/apikey",
  envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  generate,
  test,
};
