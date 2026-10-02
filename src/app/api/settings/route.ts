import { NextResponse } from "next/server";
import {
  getConfigView,
  addCredential,
  updateCredential,
  removeCredential,
  getCredentialKey,
} from "@/lib/settings";
import { PROVIDERS, isProviderId } from "@/lib/ai/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getConfigView());
}

interface SettingsBody {
  action?: "add" | "update" | "remove" | "test";
  id?: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  label?: string;
  enabled?: boolean;
}

export async function POST(req: Request) {
  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "add":
        return NextResponse.json(addCredential({
          provider: body.provider ?? "",
          apiKey: body.apiKey ?? "",
          model: body.model,
          label: body.label,
        }));

      case "update":
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        return NextResponse.json(updateCredential(body.id, {
          model: body.model,
          label: body.label,
          apiKey: body.apiKey,
          enabled: body.enabled,
        }));

      case "remove":
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        return NextResponse.json(removeCredential(body.id));

      case "test": {
        if (!isProviderId(body.provider ?? "")) {
          return NextResponse.json({ ok: false, message: "A valid provider is required." }, { status: 400 });
        }
        const provider = PROVIDERS[body.provider as "gemini" | "anthropic" | "openai"];
        // Test the typed key if given, else the stored key for this credential id.
        const key = (body.apiKey ?? "").trim() || (body.id ? getCredentialKey(body.id) ?? "" : "");
        const model = (body.model ?? "").trim() || provider.defaultModel;
        const result = await provider.test(key, model);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
