// Server-side app configuration: the pool of AI provider credentials.
//
// Many credentials can be configured at once — several keys for one provider
// (to spread free-tier quota) and/or several providers (Gemini, Anthropic,
// OpenAI). The orchestrator ([ai/index.ts]) tries them in order and fails over.
//
// Credentials are stored in data/config.json (git-ignored) and merged with any
// seeded from environment variables. This module is server-only — never import
// it into a client component.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PROVIDERS, PROVIDER_IDS, isProviderId } from "./ai/registry";
import type { AiCredential, ProviderId } from "./ai/types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

interface StoredCredential {
  id: string;
  provider: ProviderId;
  apiKey: string;
  model: string;
  label?: string;
  enabled: boolean;
}

interface AppConfig {
  credentials: StoredCredential[];
  // Legacy single-key fields, tolerated on read and migrated on first write.
  geminiApiKey?: string;
  visionModel?: string;
}

export interface CredentialView {
  id: string;
  provider: ProviderId;
  providerLabel: string;
  model: string;
  label?: string;
  enabled: boolean;
  maskedKey: string;
  source: "config" | "env";
}

export interface ConfigView {
  credentials: CredentialView[];
  providers: { id: ProviderId; label: string; defaultModel: string; models: { id: string; label: string }[]; keyHint: string }[];
  hasAnyKey: boolean;
}

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFile(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<AppConfig>;
    return { credentials: Array.isArray(raw.credentials) ? raw.credentials : [], geminiApiKey: raw.geminiApiKey, visionModel: raw.visionModel };
  } catch {
    return { credentials: [] };
  }
}

function writeFile(cfg: AppConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Fold a legacy { geminiApiKey, visionModel } into the credentials list.
function withLegacyMigrated(cfg: AppConfig): StoredCredential[] {
  const creds = [...cfg.credentials];
  const legacyKey = (cfg.geminiApiKey || "").trim();
  if (legacyKey && !creds.some((c) => c.provider === "gemini" && c.apiKey === legacyKey)) {
    creds.push({
      id: "legacy-gemini",
      provider: "gemini",
      apiKey: legacyKey,
      model: (cfg.visionModel || "").trim() || PROVIDERS.gemini.defaultModel,
      label: "Gemini (migrated)",
      enabled: true,
    });
  }
  return creds;
}

// Credentials seeded from environment variables (read-only in the UI).
function envCredentials(existing: StoredCredential[]): AiCredential[] {
  const out: AiCredential[] = [];
  for (const id of PROVIDER_IDS) {
    const provider = PROVIDERS[id];
    for (const envVar of provider.envKeys) {
      const key = (process.env[envVar] || "").trim();
      if (!key) continue;
      if (existing.some((c) => c.apiKey === key)) continue; // don't double-count
      const modelEnv = (process.env[`${id.toUpperCase()}_MODEL`] || "").trim();
      const geminiLegacyModel = id === "gemini" ? (process.env.PREP_VISION_MODEL || "").trim() : "";
      out.push({
        id: `env:${envVar}`,
        provider: id,
        apiKey: key,
        model: modelEnv || geminiLegacyModel || provider.defaultModel,
        label: `${provider.label} (env ${envVar})`,
        enabled: true,
        source: "env",
      });
    }
  }
  return out;
}

/** All credentials (config first, then env), with legacy migration applied. */
export function getAllCredentials(): AiCredential[] {
  const cfg = readFile();
  const stored = withLegacyMigrated(cfg).map<AiCredential>((c) => ({ ...c, source: "config" }));
  return [...stored, ...envCredentials(cfg.credentials)];
}

/** Only enabled credentials with a non-empty key — what the orchestrator uses. */
export function getEnabledCredentials(): AiCredential[] {
  return getAllCredentials().filter((c) => c.enabled && c.apiKey.trim());
}

function mask(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(8)}${key.slice(-4)}`;
}

export function getConfigView(): ConfigView {
  const creds = getAllCredentials();
  return {
    credentials: creds.map((c) => ({
      id: c.id,
      provider: c.provider,
      providerLabel: PROVIDERS[c.provider].label,
      model: c.model,
      label: c.label,
      enabled: c.enabled,
      maskedKey: mask(c.apiKey),
      source: c.source ?? "config",
    })),
    providers: PROVIDER_IDS.map((id) => {
      const p = PROVIDERS[id];
      return { id: p.id, label: p.label, defaultModel: p.defaultModel, models: p.models, keyHint: p.keyHint };
    }),
    hasAnyKey: creds.some((c) => c.enabled && c.apiKey.trim()),
  };
}

// ---- mutations (persist the legacy migration so it happens once) ----

function loadForWrite(): AppConfig {
  const cfg = readFile();
  const migrated = withLegacyMigrated(cfg);
  return { credentials: migrated }; // drop legacy fields once folded in
}

export interface CredentialInput {
  provider: string;
  apiKey: string;
  model?: string;
  label?: string;
}

export function addCredential(input: CredentialInput): ConfigView {
  if (!isProviderId(input.provider)) throw new Error(`Unknown provider: ${input.provider}`);
  const key = (input.apiKey || "").trim();
  if (!key) throw new Error("An API key is required.");
  const cfg = loadForWrite();
  const model = (input.model || "").trim() || PROVIDERS[input.provider].defaultModel;
  cfg.credentials.push({
    id: crypto.randomUUID(),
    provider: input.provider,
    apiKey: key,
    model,
    label: (input.label || "").trim() || undefined,
    enabled: true,
  });
  writeFile(cfg);
  return getConfigView();
}

export interface CredentialPatch {
  model?: string;
  label?: string;
  apiKey?: string;
  enabled?: boolean;
}

export function updateCredential(id: string, patch: CredentialPatch): ConfigView {
  const cfg = loadForWrite();
  const cred = cfg.credentials.find((c) => c.id === id);
  if (!cred) throw new Error("Credential not found (env-sourced keys are read-only).");
  if (typeof patch.model === "string" && patch.model.trim()) cred.model = patch.model.trim();
  if (typeof patch.label === "string") cred.label = patch.label.trim() || undefined;
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) cred.apiKey = patch.apiKey.trim();
  if (typeof patch.enabled === "boolean") cred.enabled = patch.enabled;
  writeFile(cfg);
  return getConfigView();
}

export function removeCredential(id: string): ConfigView {
  const cfg = loadForWrite();
  cfg.credentials = cfg.credentials.filter((c) => c.id !== id);
  writeFile(cfg);
  return getConfigView();
}

/** The stored key for a credential id, for the server-side connectivity test. */
export function getCredentialKey(id: string): string | null {
  return getAllCredentials().find((c) => c.id === id)?.apiKey ?? null;
}
