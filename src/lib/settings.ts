// Server-side app configuration (API keys, model choice).
//
// Stored in data/config.json so it survives restarts and can be edited from the
// Settings page. Values fall back to environment variables when the file is
// absent, so either way of configuring the app works. This module is
// server-only — never import it into a client component.

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export const DEFAULT_VISION_MODEL = "gemini-flash-latest";

// Models the Settings page offers. Any string is accepted on save, but these
// cover the common Gemini vision-capable choices.
export const VISION_MODEL_OPTIONS = [
  { id: "gemini-flash-latest", label: "Gemini Flash (latest) — fast, recommended" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest) — cheapest, most available" },
  { id: "gemini-pro-latest", label: "Gemini Pro (latest) — most capable" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash — latest pinned flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — stable" },
];

export interface AppConfig {
  geminiApiKey: string;
  visionModel: string;
}

export type KeySource = "config" | "env" | "none";

export interface ConfigView {
  hasKey: boolean;
  maskedKey: string;
  keySource: KeySource;
  model: string;
  modelSource: "config" | "env" | "default";
}

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFile(): Partial<AppConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<AppConfig>;
  } catch {
    return {};
  }
}

function writeFile(cfg: Partial<AppConfig>): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function envKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

/** The active Gemini API key: config file first, then environment. */
export function getGeminiApiKey(): string {
  const fromFile = (readFile().geminiApiKey || "").trim();
  return fromFile || envKey();
}

/** The active vision model: config file, then env, then the default. */
export function getVisionModel(): string {
  const fromFile = (readFile().visionModel || "").trim();
  return fromFile || (process.env.PREP_VISION_MODEL || "").trim() || DEFAULT_VISION_MODEL;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(10)}${key.slice(-4)}`;
}

/** A redacted, safe-to-send view of the configuration for the Settings UI. */
export function getConfigView(): ConfigView {
  const file = readFile();
  const fileKey = (file.geminiApiKey || "").trim();
  const key = fileKey || envKey();
  const keySource: KeySource = fileKey ? "config" : envKey() ? "env" : "none";

  const fileModel = (file.visionModel || "").trim();
  const envModel = (process.env.PREP_VISION_MODEL || "").trim();
  const modelSource = fileModel ? "config" : envModel ? "env" : "default";

  return {
    hasKey: Boolean(key),
    maskedKey: maskKey(key),
    keySource,
    model: getVisionModel(),
    modelSource,
  };
}

/** Apply a partial update. An empty-string key leaves the stored key untouched. */
export function updateConfig(patch: { geminiApiKey?: string; visionModel?: string }): ConfigView {
  const current = readFile();
  const next: Partial<AppConfig> = { ...current };

  if (typeof patch.geminiApiKey === "string" && patch.geminiApiKey.trim()) {
    next.geminiApiKey = patch.geminiApiKey.trim();
  }
  if (typeof patch.visionModel === "string" && patch.visionModel.trim()) {
    next.visionModel = patch.visionModel.trim();
  }

  writeFile(next);
  return getConfigView();
}

/** Remove the stored key from the config file (env fallback still applies). */
export function clearStoredKey(): ConfigView {
  const current = readFile();
  delete current.geminiApiKey;
  writeFile(current);
  return getConfigView();
}
