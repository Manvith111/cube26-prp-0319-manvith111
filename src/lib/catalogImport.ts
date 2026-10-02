// Catalog bulk-import parsing + validation.
//
// Accepts CSV or JSON (array of flat rows, or { entries: [...] }). Each row is
// validated with Zod, the rule pack reference is checked against the registry,
// and valid rows become CatalogEntry objects. Returns a per-row accept/reject
// report so the UI can show exactly which rows failed and why.

import { z } from "zod";
import { DEFAULT_RULE_PACK_ID, DEFAULT_RULE_PACK_VERSION, rulePackExists } from "./rulePacks";
import type { CatalogEntry, ProductInput } from "./types";

export interface RowResult {
  row: number; // 1-based data row (header excluded for CSV)
  sku?: string;
  ok: boolean;
  error?: string;
}

export interface ImportParseResult {
  entries: CatalogEntry[];
  results: RowResult[];
  accepted: number;
  rejected: number;
}

// --- Minimal RFC-4180 CSV parser (handles quoted fields, escaped quotes) ---
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

const boolCoerce = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return /^(true|1|yes|y)$/i.test(v.trim());
  return false;
}, z.boolean());

const marksCoerce = z.preprocess((v) => {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()));

const rowSchema = z.object({
  sku: z.coerce.string().trim().min(1, "sku is required"),
  expectedFnsku: z.coerce.string().trim().default(""),
  name: z.coerce.string().trim().default(""),
  category: z.coerce.string().trim().default(""),
  requiresPolybag: boolCoerce.default(false),
  hasExpiry: boolCoerce.default(false),
  isFragile: boolCoerce.default(false),
  coverOriginalBarcode: boolCoerce.default(false),
  requiredHandlingMarks: marksCoerce.default([]),
  rulePackId: z.coerce.string().trim().default(DEFAULT_RULE_PACK_ID),
  rulePackVersion: z.coerce.string().trim().default(DEFAULT_RULE_PACK_VERSION),
  upc: z.coerce.string().trim().optional(),
});

function rawRows(filename: string, content: string): Record<string, unknown>[] {
  const trimmed = content.trim();
  const looksJson = /\.json$/i.test(filename) || trimmed.startsWith("[") || trimmed.startsWith("{");
  if (looksJson) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)) {
      return (parsed as { entries: Record<string, unknown>[] }).entries;
    }
    throw new Error("JSON must be an array of rows or an object with an `entries` array.");
  }
  return parseCsv(content);
}

export function parseCatalog(filename: string, content: string): ImportParseResult {
  const rows = rawRows(filename, content);
  const entries: CatalogEntry[] = [];
  const results: RowResult[] = [];
  const now = new Date().toISOString();

  rows.forEach((raw, i) => {
    const rowNum = i + 1;
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((is) => `${is.path.join(".") || "row"}: ${is.message}`).join("; ");
      results.push({ row: rowNum, ok: false, error: msg });
      return;
    }
    const r = parsed.data;
    if (!rulePackExists(r.rulePackId, r.rulePackVersion)) {
      results.push({ row: rowNum, sku: r.sku, ok: false, error: `unknown rule pack ${r.rulePackId}@${r.rulePackVersion}` });
      return;
    }
    const product: ProductInput = {
      sku: r.sku,
      expectedFnsku: r.expectedFnsku,
      name: r.name,
      category: r.category,
      requiresPolybag: r.requiresPolybag,
      hasExpiry: r.hasExpiry,
      isFragile: r.isFragile,
      requiredHandlingMarks: r.requiredHandlingMarks,
      coverOriginalBarcode: r.coverOriginalBarcode,
    };
    entries.push({
      sku: r.sku,
      product,
      rulePackId: r.rulePackId,
      rulePackVersion: r.rulePackVersion,
      upc: r.upc || undefined,
      updatedAt: now,
    });
    results.push({ row: rowNum, sku: r.sku, ok: true });
  });

  return { entries, results, accepted: entries.length, rejected: results.length - entries.length };
}
