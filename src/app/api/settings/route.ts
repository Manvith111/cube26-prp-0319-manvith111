import { NextResponse } from "next/server";
import { getConfigView, updateConfig, clearStoredKey, getGeminiApiKey } from "@/lib/settings";

export const runtime = "nodejs";

// A lightweight connectivity check: list models with the given key.
async function testKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: "No API key to test." };
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "X-goog-api-key": apiKey.trim() },
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      models?: unknown[];
    };
    if (!res.ok) {
      return { ok: false, message: data?.error?.message || `HTTP ${res.status}` };
    }
    const count = Array.isArray(data.models) ? data.models.length : 0;
    return { ok: true, message: `Key is valid — ${count} models available.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  return NextResponse.json(getConfigView());
}

interface SettingsBody {
  action?: "save" | "test" | "clear";
  geminiApiKey?: string;
  visionModel?: string;
}

export async function POST(req: Request) {
  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action ?? "save";

  if (action === "test") {
    // Test the typed key if provided, otherwise fall back to the stored/env key.
    const keyToTest = (body.geminiApiKey ?? "").trim() || getGeminiApiKey();
    const result = await testKey(keyToTest);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "clear") {
    return NextResponse.json(clearStoredKey());
  }

  // save
  const view = updateConfig({
    geminiApiKey: body.geminiApiKey,
    visionModel: body.visionModel,
  });
  return NextResponse.json(view);
}
