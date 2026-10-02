# Image-generation prompts for Prep test cases

Paste these into a text-to-image model to produce **photorealistic** units that
exercise each Prep check. Each prompt maps to a catalog SKU already imported, so
on `/prep` you can "Find in catalog" → SKU, upload the generated image, and the
expected verdict below should follow.

## Reusable style header (prepend to any prompt)

> Photorealistic product photograph, shot on a DSLR with a 50mm lens, soft
> diffused studio lighting, shallow depth of field, on a clean light-grey
> warehouse packing table, slight 35° top-down angle, realistic shadows and
> reflections, high detail, 4k.

## Reusable negative prompt (SD / Flux / Midjourney `--no`)

> cartoon, illustration, 3d render, watermark, people, hands, cluttered
> background, distorted text, low resolution, duplicate labels

---

## 1 — `TEST-PASS-01` · compliant phone case → expect **PASS**
Targets: polybag present + sealed · suffocation warning present + legible · FNSKU present + placed over original barcode + text match · original barcode covered.

> A black silicone smartphone case sealed inside a transparent glossy poly bag.
> The bag is fully heat-sealed along one clean edge and printed with small black
> suffocation-warning text reading "WARNING: To avoid danger of suffocation keep
> this plastic bag away from babies and children." A white rectangular FNSKU
> label with a Code-128 barcode and the text "X00PASS001" is stuck on the front,
> positioned directly over and completely covering the product's original
> manufacturer UPC barcode. Everything sharp and clearly legible, bright even
> lighting. [style header]

Close-up variant (second photo): *Extreme close-up of the white FNSKU label, barcode and the text "X00PASS001" crisp and readable, the label edge overlapping and hiding the original UPC barcode underneath.*

---

## 2 — `TEST-FAIL-01` · non-compliant phone case → expect **FAIL**
Targets: bag NOT sealed · no suffocation warning · original barcode NOT covered · FNSKU text mismatch (expected `X00FAIL010`, label shows `X00ZZZ999`).

> A black smartphone case inside a transparent poly bag that is OPEN and
> unsealed — the mouth of the bag gaping and loose with no heat seal and no
> printed warning text anywhere on the plastic. The product's original
> manufacturer UPC barcode is fully visible and uncovered. A separate white
> FNSKU label with a Code-128 barcode reads "X00ZZZ999". Sharp focus, bright
> even lighting so every detail is readable. [style header]

---

## 3 — `TEST-EXP-FRAGILE-01` · supplement, expiry + fragile → expect **PASS**
Targets: expiry visible · handling marks present (Fragile, This Way Up) · polybag sealed + warning · FNSKU present (`X00EXP020`).

> A white supplement/vitamin bottle inside a sealed transparent poly bag, sitting
> in an open cardboard box. The box is printed with bold black handling symbols:
> a "FRAGILE" wine-glass icon and an "THIS WAY UP" double-up-arrow symbol. The
> bottle label clearly shows a printed expiry date "EXP 2027-03  BEST BEFORE".
> A white FNSKU label with a Code-128 barcode reads "X00EXP020". The poly bag has
> a small printed suffocation warning. Sharp and well lit. [style header]

---

## 4 — `TEST-UNCERTAIN-01` · unreadable capture → expect **UNCERTAIN + retake**
Targets: the AI can't tell anything → deterministic rules return UNCERTAIN (never a guess).

> A smartphone case in a poly bag photographed badly: heavy motion blur combined
> with harsh glare and overexposure from a direct light reflecting off the shiny
> plastic, so the FNSKU label and all text are completely illegible and out of
> focus, dim in the corners. Looks like a shaky low-quality phone snapshot.
> [style header — but intentionally very blurry, out of focus, blown-out glare]

Negative prompt here: *drop "distorted text / low resolution" — you WANT it unreadable.*

---

## 5 — `TEST-NOPOLY-01` · boxed item, no bag → expect bag checks **N/A**, PASS overall
Targets: no poly bag (polybag/suffocation → NOT_APPLICABLE) · FNSKU present (`X00BOX040`).

> A sealed retail product box (a boxed toy or small electronics item) sitting on
> a packing table, NOT inside any poly bag. A white FNSKU label with a Code-128
> barcode reading "X00BOX040" is stuck on the box lid. The manufacturer's
> original printed UPC barcode is also visible on the box. Sharp focus, even
> lighting. [style header]

---

## Real parcel — `V-B-SPR-B1`
No prompt needed — just photograph the actual Delhivery box you scanned; its
barcode `1490837295051823` already maps to this catalog entry.

---

## Getting the text + barcode right (important)

Image models often garble exact codes and can't draw a *scannable* barcode.
Three options, best first:

1. **Use a text-strong model:** Google *Gemini 2.5 Flash Image (Nano Banana)*,
   OpenAI *gpt-image-1* (ChatGPT/DALL·E), *Ideogram*, or *Flux.1* render short
   exact text far better than Stable Diffusion or Midjourney. Keep the quoted
   strings short and regenerate until the FNSKU reads correctly.
2. **Hybrid (most reliable):** generate the realistic product photo *without*
   relying on the label, then paste the clean label from `/test-kit.html`
   (correct text + crisp barcode) onto it in any image editor. Realistic photo +
   accurate, scannable label.
3. **Midjourney:** add `--ar 4:3 --style raw`; expect to fix the label text.

Tip: for a thorough test, generate **2–3 photos per unit** (full front, FNSKU
close-up, seal/opening close-up) and upload them together — `/prep` accepts up
to 6, which is how a real inspection is shot.
