# Architecture — OpsConsole (Prep Manager)

This document describes the system architecture, data flow, AI model usage,
decision logic, and the evidence trace for OpsConsole's **Prep Manager** track.

The one idea behind everything here: **the AI observes, a deterministic rules
engine decides.** The model is only ever asked "what can you see?"; a fixed,
auditable rulebook turns those observations into a verdict. The same evidence
therefore always produces the same result, and every line of a verdict can be
traced back to a specific rule clause and a specific photo.

---

## 1. System overview

OpsConsole is a **Next.js 15 (App Router) + React 19** application written in
TypeScript. It runs two ways from one codebase:

| Mode | Runtime | Store |
|------|---------|-------|
| Local dev / offline | Node (`next dev`) | filesystem (`data/`) |
| Production | Cloudflare Workers (OpenNext) | D1 + R2 + KV |

The storage backend is chosen behind a single `Repository` interface, so the
inspection engine and API routes never know which one is active.

```
                         ┌──────────────────────────────────────────┐
  Browser (operator)     │                 Next.js app                │
  ─────────────────      │                                            │
  /prep   manual upload ─┼─▶ /api/inspect ─┐                          │
  /capture auto-capture ─┼─▶ /api/find ──┐ │                          │
  /catalog import/browse ┼─▶ /api/catalog│ │                          │
                         │               │ ▼                          │
                         │        ┌───────────────┐   ┌─────────────┐ │
                         │        │  inspection.ts │──▶│  Repository │ │
                         │        │  (the engine)  │   │  interface  │ │
                         │        └──────┬────────┘    └──────┬──────┘ │
                         │       observe │ evaluate           │        │
                         │        ┌──────▼─────┐  ┌───────────▼──────┐ │
                         │        │ vision.ts  │  │ fileRepo / cfRepo │ │
                         │        │  (Gemini)  │  └───────────────────┘ │
                         │        └────────────┘                        │
                         └──────────────────────────────────────────┘
                                         │
                       ┌─────────────────┼──────────────────┐
                       ▼                 ▼                   ▼
                  Google Gemini     data/ (Node)      D1 / R2 / KV (CF)
                  (vision model)    records + photos  records + photos + config
```

### Client-side capture pipeline (`/capture`)

Auto-capture keeps the expensive AI call rare. Every downscaled video frame goes
through cheap, model-free, unit-tested gates **in the browser** before anything
is sent to the server:

```
camera frames
  └▶ frame.ts        downscale → luma buffer (shared primitive)
      └▶ motion.ts   state machine: learn empty bench → unit appears → unit
      │              settles → FIRE once → re-arm only after unit removed
      └▶ frameQuality.ts  Laplacian-variance sharpness + exposure/glare;
      │              keep the sharpest usable frame, drop blurry/glary ones
      └▶ barcode.ts  BarcodeDetector (Chromium) → zxing-wasm fallback
      ▼
  best frame(s) ─▶ POST /api/find ─▶ matched catalog product ─▶ POST /api/inspect
```

This is why `UNCERTAIN`-with-retake stays meaningful: a bad frame is discarded
before the model sees it, so an `UNCERTAIN` reflects genuine ambiguity, not a
preventable photo problem.

---

## 2. Data flow (an inspection, end to end)

1. **Identify the unit.** The operator picks a product, scans a barcode, or lets
   `/capture` auto-identify. Auto-ID calls `POST /api/find` →
   [`src/lib/find.ts`](src/lib/find.ts): the AI extracts visible codes + name +
   brand + keywords, and a deterministic scorer searches the catalog across
   SKU / FNSKU / UPC / name / category. An exact code scores 100; text hits add
   up; a match must clear a threshold or the result is "candidates, no match".
2. **Observe.** [`inspection.runInspection()`](src/lib/inspection.ts) resolves
   the product's **rule pack**, then calls
   [`vision.observe()`](src/lib/vision.ts). Gemini returns, per check, one of
   `met` / `not_met` / `cant_tell` with a confidence, which photo, where in it,
   and a short evidence note — plus a usability rating per photo and a literal
   transcription of the FNSKU label. **It never returns a verdict.**
3. **Decide.** [`rules.evaluate()`](src/lib/rules.ts) — a pure function — turns
   observations into per-check verdicts and an overall status, reading only from
   the rule pack.
4. **Persist.** The engine hashes each photo (SHA-256), stores the bytes and the
   assembled `EvidenceRecord` through the active `Repository`, and returns it.
5. **Review / export.** `/evidence` lists records; `/evidence/[id]` shows the
   checks table, photo fingerprints, and the raw AI response;
   `/api/records/[id]/export` emits the full record as JSON.

### The evidence trace (what makes a record defensible)

Every `EvidenceRecord` ([`src/lib/types.ts`](src/lib/types.ts)) carries:

- **`photos[].sha256`** — a tamper-evident fingerprint of every image.
- **`vision.raw`** — the exact, unedited model output the decision was based on.
- **`vision.model` / `vision.available`** — which model ran, or why it didn't.
- **`rulePack` `{ id, version, source }`** — the exact rulebook version used, so
  a verdict can be reproduced even after the rules evolve.
- **`checks[]`** — for each check: verdict, the `ruleClause` + `ruleQuote` it
  cites, the `photoIndex` + `location` of the evidence, and the confidence.
- **`createdAt`** + optional tenancy (`orgId` / `warehouseId` / `stationId` /
  `operatorId`).

---

## 3. AI model usage

- **Provider / model:** Google **Gemini** (default `gemini-2.5-flash`;
  configurable per deployment or from the Settings page — see
  [`src/lib/settings.ts`](src/lib/settings.ts)). The key resolves from
  `data/config.json` first, then `GEMINI_API_KEY` / `GOOGLE_API_KEY`.
- **Two observe-only calls, never a judge:**
  - [`vision.observe()`](src/lib/vision.ts) — per-check visual observations for
    an inspection.
  - [`find.findProduct()`](src/lib/find.ts) — read codes/text to identify which
    catalog product a photo shows.
- **Structured, validated output:** both calls demand a single JSON object,
  which is extracted (`extractJson`) and validated with **Zod**. On a parse
  failure `observe` retries once, then falls back to `available: false` so a
  network/quota/key problem degrades to `UNCERTAIN` for every check instead of
  crashing or guessing.
- **Guardrails in the prompt:** "report only what you can actually see, codes
  character for character, never guess or invent." Physical properties that a
  photo cannot prove (e.g. bag thickness) are modelled as `NOT_VERIFIABLE`, not
  `PASS`.

---

## 4. Decision logic (deterministic rules engine)

[`rules.evaluate()`](src/lib/rules.ts) maps observations → verdicts using only
the resolved **rule pack** ([`src/lib/rulePacks/`](src/lib/rulePacks/)). A rule
pack is pure data — clauses, quotes, and per-check metadata (applicability,
whether it's photo-verifiable, confidence floor). Packs are keyed `id@version`
in a registry; an unknown id/version **throws** rather than silently judging
against a different rulebook. The default is `fba@1`
([`fba-v1.ts`](src/lib/rulePacks/fba-v1.ts)).

Per-check resolution:

- Not applicable to this product → `NOT_APPLICABLE`.
- Not photo-verifiable → `NOT_VERIFIABLE`.
- Unusable photo, no evidence cited, low confidence, or `cant_tell` →
  `UNCERTAIN`.
- FNSKU transcription ≠ the product's expected code → `FAIL`.
- Otherwise `met` → `PASS`, `not_met` → `FAIL`.

Overall status (**a PASS never masks a failed/uncertain component**):

- any required `FAIL` → **FAIL**
- else any required `UNCERTAIN` → **UNCERTAIN** (with a `retake` list)
- else → **PASS**

---

## 5. Storage architecture

A single `Repository` interface ([`src/lib/repo/index.ts`](src/lib/repo/index.ts))
covers records, photos, and the catalog. `getRepository()` picks the
implementation — forced by `OPSCONSOLE_STORE`, otherwise auto-detected (`file`
on Node, `cloudflare` on the Workers runtime).

| Concern | Local (`fileRepo` → [`store.ts`](src/lib/store.ts)) | Cloudflare ([`cloudflareRepo.ts`](src/lib/repo/cloudflareRepo.ts)) |
|---------|------|------------|
| Evidence records | `data/records.json` | **D1** `evidence_records` |
| Catalog | `data/catalog.json` | **D1** `catalog` |
| Photos | `data/photos/` | **R2** bucket `opsconsole-photos` |
| Config / secrets | `data/config.json` | **KV** `CONFIG` + Worker secrets |

The D1 schema ([`migrations/0001_init.sql`](migrations/0001_init.sql)) stores the
**full record/entry as JSON** in a `data` column, so the object shape is
byte-identical across both stores; extra normalized columns (uppercased,
alphanumeric-only codes; `created_at`; tenancy ids) exist only for indexed
queries and scan lookups. Cloudflare config lives in
[`wrangler.jsonc`](wrangler.jsonc); the Worker is built with OpenNext
([`open-next.config.ts`](open-next.config.ts)).

---

## 6. API surface

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/inspect` | POST | Run observe + decide, persist an `EvidenceRecord` |
| `/api/find` | POST | Identify the catalog product from photo(s) |
| `/api/catalog` | GET/POST | List / upsert catalog entries |
| `/api/catalog/import` | POST | Bulk import catalog (CSV/JSON) |
| `/api/records` | GET | List evidence records |
| `/api/records/[id]` | GET | Fetch one record |
| `/api/records/[id]/export` | GET | Export a record as JSON |
| `/api/records/[id]/photo/[index]` | GET | Stream a stored photo |
| `/api/recovery` | POST | Match/classify fee reports against records |
| `/api/settings` | GET/POST | Read / update Gemini key + model (masked) |

---

## 7. Testing

Unit tests run under **Vitest** ([`vitest.config.mts`](vitest.config.mts)). The
client capture gates are pure and DOM-free by design, so the trigger and
quality logic are covered directly:
[`motion.test.ts`](src/lib/client/motion.test.ts),
[`frameQuality.test.ts`](src/lib/client/frameQuality.test.ts). Deterministic
`rules.evaluate()` is likewise testable with fixed observations.
`test-fixtures/` holds sample images mapping to each PASS / FAIL / UNCERTAIN
scenario.

```bash
npm test
```

---

## 8. Design decisions & trade-offs

- **Observe/decide split** — keeps results reproducible and auditable, and keeps
  the model from "deciding" based on priors instead of evidence.
- **Rule packs as versioned data** — the rulebook evolves without code changes,
  and every record pins the exact version it was judged against.
- **JSON-in-a-column D1 schema** — one record shape across stores; migrating from
  the file store to Cloudflare required no change to the engine or types.
- **Client-side gating before the AI** — motion + quality filtering keeps the
  Gemini spend to roughly one call per settled unit and makes `UNCERTAIN`
  trustworthy.
- **Degrade, never guess** — any AI failure becomes `UNCERTAIN`, never a
  fabricated `PASS`.
