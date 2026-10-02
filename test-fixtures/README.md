# Prep inspection — test fixtures

Synthetic **sample** units (clearly stamped `TEST SAMPLE`) for exercising the Prep
Manager checks end to end. They are not real products or records — just fixtures
for testing PASS / FAIL / UNCERTAIN / NOT_APPLICABLE paths.

## How to use

**On `/prep` (photo upload):**
1. In **Find in catalog**, type the SKU from the table below and press Enter — the
   product's criteria + rule pack load automatically.
2. Add the matching image from `test-fixtures/images/` (drag the file into the photo picker).
3. **Run inspection** and compare the verdict to "What it exercises".

**On `/capture` (video/webcam):** pick the SKU from the **Product** dropdown, then
present/stream the unit (or use **Capture now**).

**Regenerate anytime:** open **http://localhost:3000/test-kit.html** while the dev
server is running and click **Download PNG** under any card. Append `?s=1`..`?s=5`
for a single full-size image.

## Scenarios

| Image | SKU (Find in catalog) | Expected FNSKU | What it exercises | Expected overall |
|-------|----------------------|----------------|-------------------|------------------|
| `TEST-PASS-01.jpg` | `TEST-PASS-01` | `X00PASS001` | Sealed poly bag, suffocation warning present + legible, FNSKU present & placed over the original barcode, correct FNSKU text | **PASS** |
| `TEST-FAIL-01.jpg` | `TEST-FAIL-01` | `X00FAIL010` | Bag **open/unsealed**, **no** suffocation warning, manufacturer UPC **not covered**, FNSKU text **mismatch** (`X00ZZZ999`) | **FAIL** |
| `TEST-EXP-FRAGILE-01.jpg` | `TEST-EXP-FRAGILE-01` | `X00EXP020` | Visible expiry (`EXP 2027-03`), **Fragile** + **This Way Up** handling marks, sealed bag + warning | **PASS** (expiry & marks satisfied) |
| `TEST-UNCERTAIN-01.jpg` | `TEST-UNCERTAIN-01` | `X00UNC030` | Heavy blur / glare — the AI can't tell, so rules return UNCERTAIN with a retake list (never a guess) | **UNCERTAIN** |
| `TEST-NOPOLY-01.jpg` | `TEST-NOPOLY-01` | `X00BOX040` | Boxed item that needs no poly bag — polybag/suffocation checks come back NOT_APPLICABLE; FNSKU still checked | **PASS** (bag checks N/A) |

Plus `V-B-SPR-B1` (the real Delhivery parcel you scanned) is in the catalog,
matchable by its printed barcode `1490837295051823`.

> Verdicts depend on what the vision model actually reads in each image; these are
> the intended outcomes the fixtures are designed to produce.
