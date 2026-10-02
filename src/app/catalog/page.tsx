"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "@/lib/types";

interface RowResult {
  row: number;
  sku?: string;
  ok: boolean;
  error?: string;
}

interface ImportReport {
  accepted: number;
  rejected: number;
  total: number;
  results: RowResult[];
}

const TEMPLATE_HEADERS =
  "sku,expectedFnsku,name,category,requiresPolybag,hasExpiry,isFragile,coverOriginalBarcode,requiredHandlingMarks,rulePackId,rulePackVersion,upc";
const TEMPLATE_ROWS = [
  "PC-IP15-BLK,X001ABC123,Silicone Phone Case (iPhone 15 Black),Electronics Accessories,true,false,false,true,,fba,1,012345678905",
  "MUG-CER-350,X004JKL012,Ceramic Coffee Mug 350ml,Home & Kitchen,true,false,true,false,Fragile,fba,1,",
  "VIT-D3-120,X003GHI789,Vitamin D3 Softgels 120ct,Health & Household,true,true,false,true,,fba,1,",
];

export default function CatalogPage() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadCatalog() {
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  async function onFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError(null);
    setReport(null);
    try {
      const content = await file.text();
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
      setReport(data as ImportReport);
      await loadCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Catalog</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Upload your product list once. Each row carries its own prep criteria and the{" "}
          <span className="gradient-text font-semibold">rule pack</span> it is judged against, so a scanned
          unit loads its requirements automatically.
        </p>
      </div>

      <section className="animate-fade-up delay-1 mt-6 surface-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">Bulk import</h2>
          <button onClick={downloadTemplate} className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
            ⤓ Download CSV template
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          CSV or JSON. Columns: sku, expectedFnsku, name, category, requiresPolybag, hasExpiry, isFragile,
          coverOriginalBarcode, requiredHandlingMarks (<code>;</code>-separated), rulePackId, rulePackVersion, upc.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="btn-accent px-5 py-2.5 text-sm disabled:opacity-40"
          >
            {importing ? "Importing…" : "Choose file to import"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-xs text-[var(--muted)]">{entries.length} products in catalog</span>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        ) : null}

        {report ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-semibold text-emerald-400">{report.accepted} accepted</span>
              <span className={report.rejected > 0 ? "font-semibold text-red-400" : "text-[var(--muted)]"}>
                {report.rejected} rejected
              </span>
              <span className="text-[var(--muted)]">of {report.total} rows</span>
            </div>
            {report.rejected > 0 ? (
              <ul className="mt-3 space-y-1 text-xs">
                {report.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.row} className="text-red-300">
                      Row {r.row}
                      {r.sku ? ` (${r.sku})` : ""}: {r.error}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="animate-fade-up delay-2 mt-6 surface-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">Products</h2>
        </div>
        {entries.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--muted)]">
            No products yet. Import a CSV or JSON above to get started.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">SKU</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">FNSKU</th>
                <th className="px-4 py-2.5 font-semibold">UPC</th>
                <th className="px-4 py-2.5 font-semibold">Rule pack</th>
                <th className="px-4 py-2.5 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {entries.map((e) => (
                <tr key={e.sku} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs">{e.sku}</td>
                  <td className="px-4 py-3">{e.product.name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.product.expectedFnsku || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.upc || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {e.rulePackId}@{e.rulePackVersion}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-[var(--muted)]">
                    {[
                      e.product.requiresPolybag ? "polybag" : null,
                      e.product.hasExpiry ? "expiry" : null,
                      e.product.isFragile ? "fragile" : null,
                      e.product.coverOriginalBarcode ? "cover-barcode" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
