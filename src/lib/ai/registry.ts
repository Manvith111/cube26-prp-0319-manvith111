// Provider registry — the single source of truth for which providers exist.

import { geminiProvider } from "./providers/gemini";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";
import type { ProviderDef, ProviderId, ProviderMeta } from "./types";

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(x: string): x is ProviderId {
  return x in PROVIDERS;
}

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS[id];
}

// Metadata only (no functions) — safe to serialize to the Settings UI.
export function providerMetas(): ProviderMeta[] {
  return PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id];
    return {
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      models: p.models,
      keyHint: p.keyHint,
      envKeys: p.envKeys,
    };
  });
}
