"use client";

import { useRef, useState } from "react";
import { SAMPLE_PRODUCTS, emptyProduct, PREP_REQUIREMENTS_SOURCE } from "@/lib/prepRequirements";
import type { CheckResult, EvidenceRecord, ProductInput } from "@/lib/types";
import { OverallBanner, VerdictBadge } from "@/components/VerdictBadge";

interface PhotoItem {
  id: string;
  filename: string;
  mediaType: string;
  dataUrl: string;
  base64: string;
}

function fileToItem(file: File): Promise<PhotoItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({
        id: Math.random().toString(36).slice(2),
        filename: file.name,
        mediaType: file.type || "image/jpeg",
        dataUrl,
        base64: dataUrl.split(",")[1] ?? "",
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PrepPage() {
  const [product, setProduct] = useState<ProductInput>(emptyProduct());
  const [marksText, setMarksText] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceRecord | null>(null);
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function update<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setProduct((p) => ({ ...p, [key]: value }));
  }

  function loadSample(sku: string) {
    const s = SAMPLE_PRODUCTS.find((p) => p.sku === sku);
    if (!s) return;
    setProduct({ ...s });
    setMarksText(s.requiredHandlingMarks.join(", "));
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const items = await Promise.all(Array.from(files).map(fileToItem));
    setPhotos((prev) => [...prev, ...items].slice(0, 6));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    const marks = marksText.split(",").map((m) => m.trim()).filter(Boolean);
    const payloadProduct = { ...product, requiredHandlingMarks: marks };
    try {
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: payloadProduct,
          photos: photos.map((p) => ({ filename: p.filename, mediaType: p.mediaType, dataBase64: p.base64 })),
          shipmentId,
          unitId,
          notes,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Inspection failed (${res.status})`);
      }
      const rec: EvidenceRecord = await res.json();
      setResult(rec);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const canRun = product.sku.trim().length > 0 && photos.length > 0 && !loading;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <div className="animate-fade-up">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Prep Manager</h1>
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            Judged
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Photograph a prepared unit and check it against the prep requirements. The AI only describes
          what it sees; fixed rules decide <span className="gradient-text font-semibold">PASS / FAIL / UNCERTAIN</span>.
        </p>
      </div>

      <section className="animate-fade-up delay-1 mt-6 surface-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] text-xs text-[var(--accent)]">1</span>
            Product information
          </h2>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            Load sample product
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
              defaultValue=""
              onChange={(e) => loadSample(e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {SAMPLE_PRODUCTS.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="SKU" value={product.sku} onChange={(v) => update("sku", v)} placeholder="PC-IP15-BLK" />
          <Field label="Expected FNSKU" value={product.expectedFnsku} onChange={(v) => update("expectedFnsku", v)} placeholder="X001ABC123" />
          <Field label="Product name" value={product.name} onChange={(v) => update("name", v)} placeholder="Silicone Phone Case" />
          <Field label="Category" value={product.category} onChange={(v) => update("category", v)} placeholder="Electronics Accessories" />
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <Toggle label="Requires poly-bag" checked={product.requiresPolybag} onChange={(v) => update("requiresPolybag", v)} />
          <Toggle label="Has expiry date" checked={product.hasExpiry} onChange={(v) => update("hasExpiry", v)} />
          <Toggle label="Fragile" checked={product.isFragile} onChange={(v) => update("isFragile", v)} />
          <Toggle label="Cover original barcode" checked={product.coverOriginalBarcode} onChange={(v) => update("coverOriginalBarcode", v)} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Required handling marks (comma-separated)" value={marksText} onChange={setMarksText} placeholder="Fragile, This Way Up" />
          <Field label="Shipment ID (optional)" value={shipmentId} onChange={setShipmentId} placeholder="FBA-SHIP-001" />
          <Field label="Unit ID (optional)" value={unitId} onChange={setUnitId} placeholder="UNIT-0001" />
        </div>
        <div className="mt-4">
          <Field label="Work-order notes (optional)" value={notes} onChange={setNotes} placeholder="polybag + FNSKU label" />
        </div>
      </section>

      <section className="animate-fade-up delay-2 mt-6 surface-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] text-xs text-[var(--accent)]">2</span>
          Photographs
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Up to 6 photos — front, back, a close-up of the FNSKU label, and the seams.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative">
              <img
                src={p.dataUrl}
                alt={p.filename}
                className="h-24 w-24 cursor-zoom-in rounded-xl object-cover ring-1 ring-[var(--border)] transition-transform duration-200 group-hover:scale-[1.03]"
                onClick={() => setZoom({ src: p.dataUrl, caption: `Photo ${i + 1} · ${p.filename}` })}
              />
              <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 text-[10px] font-semibold text-white">#{i + 1}</span>
              <button
                onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 text-[10px] text-red-300 hover:text-red-200"
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < 6 ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)] transition-all duration-200 hover:border-[color-mix(in_oklab,var(--accent)_60%,transparent)] hover:text-[var(--text)] hover:shadow-[var(--shadow-glow)]"
            >
              <span className="text-2xl">+</span>
              Add photo
            </button>
          ) : null}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </div>
      </section>

      <div className="mt-6 flex items-center gap-4">
        <button onClick={run} disabled={!canRun} className="btn-accent px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent-ink)] border-t-transparent" />
              Inspecting…
            </span>
          ) : (
            "Run inspection →"
          )}
        </button>
        {!product.sku.trim() ? <span className="text-xs text-[var(--muted)]">Enter a SKU to continue.</span> : null}
        {product.sku.trim() && photos.length === 0 ? <span className="text-xs text-[var(--muted)]">Add at least one photo.</span> : null}
      </div>

      {error ? (
        <div className="animate-fade-up mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      ) : null}

      {result ? (
        <div ref={resultRef}>
          <ResultView result={result} onZoom={setZoom} />
        </div>
      ) : null}

      {zoom ? (
        <div className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={() => setZoom(null)}>
          <img src={zoom.src} alt={zoom.caption} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
          <div className="mt-3 text-sm text-slate-200">{zoom.caption}</div>
          <button className="mt-2 text-xs text-slate-400">click anywhere to close</button>
        </div>
      ) : null}
    </div>
  );
}

function ResultView({ result, onZoom }: { result: EvidenceRecord; onZoom: (z: { src: string; caption: string }) => void }) {
  const main = result.checks.filter((c) => c.applicable && c.verifiable);
  const notVerifiable = result.checks.filter((c) => c.applicable && !c.verifiable);
  const notApplicable = result.checks.filter((c) => !c.applicable);

  return (
    <div className="animate-fade-up mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide">Result</h2>
        <a href={`/api/records/${result.id}/export`} className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
          ⤓ Download evidence record
        </a>
      </div>

      <OverallBanner status={result.overall.status} reason={result.overall.reason} retake={result.overall.retake} />

      {!result.vision.available ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          AI observation was unavailable, so every check fell back to UNCERTAIN (it never guesses). {result.vision.note}
        </div>
      ) : null}

      <div className="surface-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Check</th>
              <th className="px-4 py-2.5 font-semibold">Verdict</th>
              <th className="px-4 py-2.5 font-semibold">Observed evidence</th>
              <th className="px-4 py-2.5 font-semibold">Photo</th>
              <th className="px-4 py-2.5 font-semibold">Conf.</th>
              <th className="px-4 py-2.5 font-semibold">Rule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {main.map((c) => (
              <CheckRow key={c.checkId} c={c} result={result} onZoom={onZoom} />
            ))}
          </tbody>
        </table>
      </div>

      {notVerifiable.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Not verifiable from photos</div>
          <ul className="mt-2 space-y-2">
            {notVerifiable.map((c) => (
              <li key={c.checkId} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[var(--muted)]">{c.observed}</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">{c.ruleClause}: “{c.ruleQuote}”</div>
                </div>
                <VerdictBadge verdict={c.verdict} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notApplicable.length > 0 ? (
        <div className="text-xs text-[var(--muted)]">Not applicable to this product: {notApplicable.map((c) => c.name).join(", ")}.</div>
      ) : null}

      <div className="text-xs text-[var(--muted)]">
        Record <span className="font-mono text-[var(--text)]">{result.id}</span> · {new Date(result.createdAt).toLocaleString()} · model{" "}
        <span className="font-mono">{result.vision.model}</span> · source: {PREP_REQUIREMENTS_SOURCE}
      </div>
    </div>
  );
}

function CheckRow({ c, result, onZoom }: { c: CheckResult; result: EvidenceRecord; onZoom: (z: { src: string; caption: string }) => void }) {
  const photoUrl = c.photoIndex != null ? `/api/records/${result.id}/photo/${c.photoIndex}` : null;
  return (
    <tr className="align-top transition-colors hover:bg-[color-mix(in_oklab,var(--text)_4%,transparent)]">
      <td className="px-4 py-3">
        <div className="font-medium">{c.name}</div>
        <div className="text-[11px] text-[var(--muted)]">{c.expected}</div>
      </td>
      <td className="px-4 py-3">
        <VerdictBadge verdict={c.verdict} />
      </td>
      <td className="px-4 py-3 text-[var(--text)]">{c.observed}</td>
      <td className="px-4 py-3">
        {photoUrl ? (
          <button onClick={() => onZoom({ src: photoUrl, caption: `${c.name} · photo ${c.photoIndex}${c.location ? ` · ${c.location}` : ""}` })} className="block">
            <img src={photoUrl} alt={`photo ${c.photoIndex}`} className="h-12 w-12 cursor-zoom-in rounded-lg object-cover ring-1 ring-[var(--border)]" />
            {c.location ? <span className="mt-1 block text-[10px] text-[var(--muted)]">{c.location}</span> : null}
          </button>
        ) : (
          <span className="text-[11px] text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {c.confidence ? <span className="text-[11px] uppercase text-[var(--muted)]">{c.confidence}</span> : <span className="text-[11px] text-[var(--muted)]">—</span>}
      </td>
      <td className="px-4 py-3">
        <details>
          <summary className="cursor-pointer text-[11px] text-[var(--link)]">{c.ruleClause}</summary>
          <p className="mt-1 max-w-xs text-[11px] italic text-[var(--muted)]">“{c.ruleQuote}”</p>
        </details>
      </td>
    </tr>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-shadow focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}
