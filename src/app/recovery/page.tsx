"use client";

import { useState } from "react";
import Link from "next/link";
import { SAMPLE_FEE_REPORT, type FeeCharge, type RecoveryOutput } from "@/lib/recovery";

const DISPO_STYLE: Record<string, string> = {
  CONTRADICTED: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  SUPPORTED: "bg-red-500/15 text-red-300 ring-red-500/40",
  SILENT: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
  DUPLICATE: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  ALREADY_REIMBURSED: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
};
const DISPO_LABEL: Record<string, string> = {
  CONTRADICTED: "CONTRADICTED",
  SUPPORTED: "SUPPORTED",
  SILENT: "SILENT",
  DUPLICATE: "DUPLICATE",
  ALREADY_REIMBURSED: "ALREADY REIMBURSED",
};

export default function RecoveryPage() {
  const [text, setText] = useState("");
  const [out, setOut] = useState<RecoveryOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function loadSample() {
    setText(JSON.stringify(SAMPLE_FEE_REPORT, null, 2));
    setOut(null);
    setErr(null);
  }

  async function run() {
    setLoading(true);
    setErr(null);
    setOut(null);
    let charges: FeeCharge[];
    try {
      charges = JSON.parse(text);
      if (!Array.isArray(charges)) throw new Error("Expected a JSON array of charges.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charges }),
      });
      if (!res.ok) throw new Error(`Recovery failed (${res.status})`);
      setOut(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const money = (n: number, cur: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Recovery Manager</h1>
        <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
          Stretch
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        Upload a fee report. Each charge is matched to a Prep evidence record and
        classified. The goal is <span className="text-[var(--text)]">defensible claims</span>, not maximum claims.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={loadSample} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5">
          Load sample fee report
        </button>
        <button
          onClick={run}
          disabled={loading || !text.trim()}
          className="btn-accent px-4 py-1.5 text-xs disabled:opacity-40"
        >
          {loading ? "Matching…" : "Match & classify"}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Paste a JSON array of charges, or click "Load sample fee report".'
        className="mt-3 h-48 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 font-mono text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />

      {err ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>
      ) : null}

      {out ? (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="text-2xl font-bold text-emerald-300">{money(out.totalClaim, out.currency)}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Claimable (contradicted)</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
              <div className="text-2xl font-bold">{out.results.length}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Charges reviewed</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
              <div className="text-2xl font-bold text-amber-300">{out.duplicateFlagged}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Duplicates flagged</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Charge</th>
                  <th className="px-4 py-2 font-semibold">Amount</th>
                  <th className="px-4 py-2 font-semibold">Disposition</th>
                  <th className="px-4 py-2 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {out.results.map((r) => (
                  <tr key={r.charge.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{r.charge.id}</div>
                      <div className="text-[11px] text-[var(--muted)]">{r.charge.type}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {r.charge.sku} {r.charge.shipmentId ? `· ${r.charge.shipmentId}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {money(r.charge.amount, r.charge.currency)}
                      {r.disposition === "CONTRADICTED" ? (
                        <div className="text-[11px] text-emerald-300">claim {money(r.claimAmount, r.charge.currency)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
                          DISPO_STYLE[r.disposition]
                        }`}
                      >
                        {DISPO_LABEL[r.disposition]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text)]">
                      {r.explanation}
                      {r.matchedRecordId ? (
                        <>
                          {" "}
                          <Link href={`/evidence/${r.matchedRecordId}`} className="text-[var(--link)] hover:underline">
                            view record
                          </Link>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-[var(--muted)]">
            To see a fee flip from SILENT to CONTRADICTED: run a PASS inspection in
            the Prep Manager for SKU <span className="font-mono text-[var(--text)]">PC-IP15-BLK</span> (or any SKU in the
            report), then re-run this.
          </p>
        </div>
      ) : null}
    </div>
  );
}
