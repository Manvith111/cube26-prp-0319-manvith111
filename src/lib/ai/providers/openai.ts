// OpenAI provider — Chat Completions with vision (data-URL images).

import { AiError, type AiCredential, type PhotoInput, type ProviderDef } from "../types";

const URL = "https://api.openai.com/v1/chat/completions";

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[];
  error?: { type?: string; code?: string; message?: string };
}

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const n = parseFloat(h);
  return Number.isFinite(n) ? Math.ceil(n * 1000) : undefined;
}

async function generate(
  cred: AiCredential,
  system: string,
  userText: string,
  photos: PhotoInput[],
): Promise<string> {
  const content = [
    { type: "text" as const, text: userText },
    ...photos.map((p) => ({
      type: "image_url" as const,
      image_url: { url: `data:${p.mediaType || "image/jpeg"};base64,${p.dataBase64}` },
    })),
  ];
  const body = {
    model: cred.model,
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  };

  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.apiKey}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as OpenAiResponse;

  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || data.error?.code === "insufficient_quota") {
      throw new AiError("quota", `OpenAI: ${msg}`, retryAfterMs(res));
    }
    if (res.status === 401 || res.status === 403) throw new AiError("auth", `OpenAI: ${msg}`);
    throw new AiError("other", `OpenAI: ${msg}`);
  }

  const text = (data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new AiError("other", "OpenAI returned an empty response.");
  return text;
}

async function test(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: "No API key to test." };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; data?: unknown[] };
    if (!res.ok) return { ok: false, message: data.error?.message || `HTTP ${res.status}` };
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return { ok: true, message: `Key is valid — ${count} models available.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const openaiProvider: ProviderDef = {
  id: "openai",
  label: "OpenAI",
  defaultModel: "gpt-4o-mini",
  models: [
    { id: "gpt-4o-mini", label: "GPT-4o mini — fast, cheap vision" },
    { id: "gpt-4o", label: "GPT-4o — most capable vision" },
  ],
  keyHint: "platform.openai.com/api-keys",
  envKeys: ["OPENAI_API_KEY"],
  generate,
  test,
};
