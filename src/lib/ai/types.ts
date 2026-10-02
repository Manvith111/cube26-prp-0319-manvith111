// Shared types for the multi-provider AI layer.
//
// OpsConsole talks to several vision LLM providers (Gemini, Anthropic, OpenAI)
// behind one interface. A credential is a single (provider, key, model) entry;
// the caller configures many, and the orchestrator ([ai/index.ts]) tries them in
// order — so a quota-limited key or a whole provider fails over to the next.

export type ProviderId = "gemini" | "anthropic" | "openai";

export interface PhotoInput {
  index: number;
  mediaType: string;
  dataBase64: string;
}

// One configured AI credential. `id` is stable so the UI can edit/remove it.
export interface AiCredential {
  id: string;
  provider: ProviderId;
  apiKey: string;
  model: string;
  label?: string;
  enabled: boolean;
  source?: "config" | "env"; // where it came from (env creds are read-only)
}

// Why a provider call failed — the orchestrator uses this to decide failover.
export type AiErrorKind = "quota" | "auth" | "blocked" | "other";

export class AiError extends Error {
  kind: AiErrorKind;
  retryAfterMs?: number;
  constructor(kind: AiErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: { id: string; label: string }[];
  keyHint: string; // where to get a key
  envKeys: string[]; // env var names that seed a credential
}

export interface ProviderDef extends ProviderMeta {
  // Send one request. Returns the raw model text (JSON, possibly fenced).
  generate(cred: AiCredential, system: string, userText: string, photos: PhotoInput[]): Promise<string>;
  // Lightweight connectivity/credential check.
  test(apiKey: string, model: string): Promise<{ ok: boolean; message: string }>;
}

export interface AiCallResult {
  text: string;
  provider: ProviderId;
  model: string;
  credentialId: string;
}
