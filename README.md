# OpsConsole — Prep Manager

**One platform, five AI Managers, one evidence chain.**

OpsConsole turns every physical inspection on the warehouse floor into a
timestamped, tamper-evident evidence record. The **Prep Manager** (the judged,
complete module) looks at photos of a prepared unit, checks it against the prep
requirements, and returns a clear verdict with the visual evidence and the exact
rule behind every line. The **Recovery Manager** then uses those same records to
contradict unfair marketplace fees.

---

## The problem

Before products ship into a fulfilment centre, every unit must be prepped to a
strict standard (poly-bagged and sealed, suffocation warning, a scannable FNSKU
label on a flat surface, the original barcode covered, expiry visible, handling
marks present). Today those checks are manual and inconsistent, a work order is
not proof, and errors surface weeks later as fees with **no evidence to dispute
them**. OpsConsole captures the proof at the moment of prep.

## Design principles (these are the point)

1. **UNCERTAIN is a valid answer.** A blurry, cropped or glary photo yields
   `UNCERTAIN` with retake guidance — never a guess.
2. **The AI observes; the rules decide.** Claude only *describes what it can
   see* (`met` / `not_met` / `cant_tell` + confidence + which photo + where).
   A fixed, transparent rules engine turns those observations into the verdict,
   so the **same evidence always gives the same result**.
3. **No invented rules.** Every check cites a specific clause and exact quote
   from the prep requirements document ([`src/lib/prepRequirements.ts`](src/lib/prepRequirements.ts)).
4. **No invented evidence.** A verdict with no visible evidence becomes
   `UNCERTAIN`.
5. **Honest about limits.** Physical properties (bag thickness / material) are
   shown as `NOT VERIFIABLE`, never `PASS`.
6. **Tamper-evident.** Each record stores a SHA-256 of every photo, the raw AI
   response, and a timestamp.

## How it works (the pipeline)

```
photos ──▶ vision.ts (Claude: OBSERVE only)      ──▶ observations JSON
                                                      │
product config + prepRequirements.ts (the rulebook)  ▼
                          rules.ts (DECIDE, deterministic) ──▶ verdicts + overall
                                                      │
                                     store.ts  ──▶ evidence record (JSON + hashed photos)
```

- [`src/lib/vision.ts`](src/lib/vision.ts) — the only AI call. Claude returns
  per-check observations, a usability rating per photo, and a literal
  transcription of the FNSKU label. It **never** returns a verdict. Parsing is
  validated with Zod and retried once; on any failure it falls back to
  `available: false` and every check becomes `UNCERTAIN` (so a network/API
  problem in the demo never crashes and never guesses).
- [`src/lib/rules.ts`](src/lib/rules.ts) — pure function. Low confidence, no
  evidence cited, unusable photo, or `cant_tell` → `UNCERTAIN`. FNSKU text
  mismatch → `FAIL`. Any required `FAIL` → overall `FAIL`; else any required
  `UNCERTAIN` → overall `UNCERTAIN (needs review)` with a retake list; else
  `PASS`.
- [`src/lib/store.ts`](src/lib/store.ts) — file-backed store under `data/`.
  Records survive a restart.

## The checks

| # | Check | Photo-verifiable? |
|---|---|---|
| 1 | Poly-bag present | yes |
| 2 | Poly-bag sealed | yes |
| 3 | Suffocation warning present | yes |
| 4 | Suffocation warning legible | yes |
| 5 | FNSKU label present | yes |
| 6 | FNSKU placement (flat, not on a curve/seam/edge) | yes |
| 7 | FNSKU text matches the expected code | yes |
| 8 | Original barcode covered | yes |
| 9 | Expiry date visible | yes |
| 10 | Handling marks present | yes |
| 11 | Bag thickness / material | **no → NOT VERIFIABLE** |

Each check applies only where the product needs it (`NOT_APPLICABLE` otherwise).

## Run it

Requirements: Node 18+.

```bash
npm install
```

Set your Anthropic key so the vision step runs (copy `.env.example`):

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
# optional — faster/cheaper demos: PREP_VISION_MODEL=claude-sonnet-5-5
```

> Without a key the app still runs end to end — every check safely returns
> `UNCERTAIN` with a note, demonstrating principle #1.

```bash
npm run dev     # http://localhost:3000
# or
npm run build && npm start
```

## Demo script (2–3 min)

1. **Dashboard** — the pitch and live counts.
2. **Prep Manager** → *Load sample product* (Silicone Phone Case) → add photos
   of a correctly prepped unit → **Run inspection** → walk the checks table:
   each line has the observed evidence, the photo, the confidence and the exact
   rule quote. Overall **PASS**.
3. A unit with the **FNSKU across a seam** → overall **FAIL**, naming the photo
   and location.
4. A **blurry** photo → **UNCERTAIN** with "re-photograph" guidance — "we don't
   guess."
5. **Not-verifiable panel** — bag thickness is shown as `NOT VERIFIABLE`.
6. **Evidence Log → a record** — photo SHA-256 fingerprints, raw AI response,
   timestamp, download. "Tamper-evident proof."
7. **Recovery Manager** → *Load sample fee report* → **Match & classify**. The
   packaging-defect fee for `PC-IP15-BLK` is **CONTRADICTED** by your Prep record
   (a claim is prepared); a duplicate is caught; an already-reimbursed fee and an
   unmatched SKU are **SILENT**. "Defensible claims, not maximum claims."

## Test scenarios (§1.9)

The 10 scenarios map directly to outcomes: correct prep → `PASS`; missing /
hidden warning, bad FNSKU placement, FNSKU across a seam, visible original
barcode, covered expiry, missing handling mark → `FAIL`; blurry / ambiguous →
`UNCERTAIN` with retake guidance. Because the rules are deterministic, the same
photos always produce the same result.

## The platform — one evidence chain

Every Manager writes the **same `EvidenceRecord`** shape
([`src/lib/types.ts`](src/lib/types.ts)). That is what turns five tools into one
system.

| Manager | Question | Decision | Status |
|---|---|---|---|
| **Prep** | Was this unit prepped to standard? | PASS / FAIL / UNCERTAIN | **complete** |
| **Recovery** | Does our evidence contradict this fee? | CONTRADICTED / SUPPORTED / SILENT / DUPLICATE / ALREADY REIMBURSED | built |
| **Pack** | Does the box contain exactly what was ordered? | SEAL / STOP & FIX / UNCERTAIN | planned |
| **Receiving** | Did we receive what we ordered, undamaged? | ACCEPT / EXCEPTION / UNCERTAIN | planned |
| **Returns** | What came back, what condition, what next? | RESTOCK / REFURBISH / LIQUIDATE / DISPOSE / UNCERTAIN | planned |

## Project map

```
src/
  app/
    page.tsx                     Dashboard
    prep/page.tsx                Prep Manager (inspect UI)
    evidence/page.tsx            Evidence Log (search)
    evidence/[id]/page.tsx       Record detail (fingerprints, raw AI, export)
    recovery/page.tsx            Recovery Manager
    pack|receiving|returns/      Planned managers
    api/
      inspect/                   POST → observe + decide + save
      records/ ...               list / get / export / photo bytes
      recovery/                  POST → classify charges
  lib/
    types.ts                     shared EvidenceRecord shape
    prepRequirements.ts          the rulebook (clauses + quotes) + sample products
    vision.ts                    Claude observation step (no verdicts)
    rules.ts                     deterministic decision engine
    store.ts                     file-backed evidence store + SHA-256
    recovery.ts                  fee matching + classification + sample report
data/                            runtime records.json + photos/ (git-ignored)
```

## Notes

- The rulebook quotes model standard marketplace (FBA-style) prep requirements
  so every check is traceable. Replace the `quote` / `clause` strings in
  `prepRequirements.ts` with the official challenge document verbatim — nothing
  else changes, because the rules engine only ever reads from there.
- Out of scope (per the brief): user accounts, multiple warehouses, live camera,
  mobile apps, measuring physical properties, training custom models.
