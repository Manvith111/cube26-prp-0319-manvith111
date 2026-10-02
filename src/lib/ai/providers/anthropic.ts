// Anthropic (Claude) provider — Messages API with vision.

import { AiError, type AiCredential, type PhotoInput, type ProviderDef } from "../types";

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  error?: { type?: string; message?: string };
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
    ...photos.map((p) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: p.mediaType || "image/jpeg", data: p.dataBase64 },
    })),
    // Nudge pure-JSON output: Claude has no response-format flag.
    { type: "text" as const, text: `${userText}\n\nRespond with ONLY the JSON object, no prose or markdown.` },
  ];
  const body = {
    model: cred.model,
    max_tokens: 4096,
    temperature: 0,
    system,
    messages: [{ role: "user", content }],
  };

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cred.apiKey,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as AnthropicResponse;

  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || data.error?.type === "rate_limit_error" || data.error?.type === "overloaded_error") {
      throw new AiError("quota", `Anthropic: ${msg}`, retryAfterMs(res));
    }
    if (res.status === 401 || res.status === 403) throw new AiError("auth", `Anthropic: ${msg}`);
    throw new AiError("other", `Anthropic: ${msg}`);
  }

  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("\n").trim();
  if (!text) throw new AiError("other", "Anthropic returned an empty response.");
  return text;
}

async function test(apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: "No API key to test." };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey.trim(), "anthropic-version": VERSION },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.ok) return { ok: true, message: "Key is valid." };
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    // A 400 from max_tokens=1 still proves the key authenticated; only auth codes fail.
    if (res.status !== 401 && res.status !== 403) return { ok: true, message: "Key authenticated." };
    return { ok: false, message: data.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const anthropicProvider: ProviderDef = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  defaultModel: "claude-sonnet-5-5",
  models: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — best general vision" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 — deepest reasoning" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast, cheap" },
  ],
  keyHint: "console.anthropic.com/settings/keys",
  envKeys: ["ANTHROPIC_API_KEY"],
  generate,
  test,
};
