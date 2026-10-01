"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EvidenceRecord } from "@/lib/types";
import { OverallBanner, VerdictBadge } from "@/components/VerdictBadge";

export default function RecordDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [rec, setRec] = useState<EvidenceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/records/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Record not found (${r.status})`);
        return r.json();
      })
      .then(setRec)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="px-8 py-10 text-[var(--muted)]">Loading…</div>;
  if (err || !rec)
    return (
      <div className="px-8 py-10">
        <div className="text-red-300">{err || "Not found"}</div>
        <Link href="/evidence" className="mt-2 inline-block text-[var(--link)]">
          ← Evidence log
        </Link>
      </div>
    );

  const main = rec.checks.filter((c) => c.applicable && c.verifiable);
  const notVerifiable = rec.checks.filter((c) => c.applicable && !c.verifiable);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link href="/evidence" className="text-xs text-[var(--link)] hover:underline">
        ← Evidence log
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{rec.product.name || rec.product.sku}</h1>
          <div className="mt-1 font-mono text-xs text-[var(--muted)]">{rec.id}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {rec.product.sku} · {rec.product.category} · {new Date(rec.createdAt).toLocaleString()}
            {rec.shipmentId ? ` · shipment ${rec.shipmentId}` : ""}
            {rec.unitId ? ` · unit ${rec.unitId}` : ""}
          </div>
        </div>
        <a href={`/api/records/${rec.id}/export`} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5">
          ⤓ Download JSON
        </a>
      </div>

      <div className="mt-5">
        <OverallBanner status={rec.overall.status} reason={rec.overall.reason} retake={rec.overall.retake} />
      </div>

      <h2 className="mt-8 text-sm font-semibold">Checks</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Check</th>
              <th className="px-4 py-2 font-semibold">Verdict</th>
              <th className="px-4 py-2 font-semibold">Observed</th>
              <th className="px-4 py-2 font-semibold">Photo</th>
              <th className="px-4 py-2 font-semibold">Rule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {main.map((c) => {
              const photoUrl = c.photoIndex != null ? `/api/records/${rec.id}/photo/${c.photoIndex}` : null;
              return (
                <tr key={c.checkId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-[var(--muted)]">{c.expected}</div>
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={c.verdict} />
                  </td>
                  <td className="px-4 py-3">{c.observed}</td>
                  <td className="px-4 py-3">
                    {photoUrl ? (
                      <button onClick={() => setZoom({ src: photoUrl, caption: `${c.name} · photo ${c.photoIndex}` })}>
                        <img src={photoUrl} alt="" className="h-12 w-12 cursor-zoom-in rounded object-cover ring-1 ring-[var(--border)]" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-[11px] text-[var(--link)]">{c.ruleClause}</summary>
                      <p className="mt-1 max-w-xs text-[11px] italic text-[var(--muted)]">“{c.ruleQuote}”</p>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notVerifiable.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Not verifiable from photos</div>
          <ul className="mt-2 space-y-1">
            {notVerifiable.map((c) => (
              <li key={c.checkId} className="flex items-center justify-between gap-3">
                <span>{c.name}</span>
                <VerdictBadge verdict={c.verdict} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="mt-8 text-sm font-semibold">Photo fingerprints</h2>
      <p className="text-xs text-[var(--muted)]">SHA-256 of each image at capture time — proof the evidence hasn&apos;t been altered.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {rec.photos.map((p) => {
          const url = `/api/records/${rec.id}/photo/${p.index}`;
          return (
            <div key={p.index} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3">
              <button onClick={() => setZoom({ src: url, caption: `Photo ${p.index} · ${p.filename}` })}>
                <img src={url} alt="" className="h-16 w-16 cursor-zoom-in rounded object-cover ring-1 ring-[var(--border)]" />
              </button>
              <div className="min-w-0 text-xs">
                <div className="font-medium">
                  #{p.index} · {p.filename}
                </div>
                <div className="text-[var(--muted)]">{p.mediaType}</div>
                <div className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">{p.sha256}</div>
              </div>
            </div>
          );
        })}
        {rec.photos.length === 0 ? <div className="text-sm text-[var(--muted)]">No photos stored.</div> : null}
      </div>

      <h2 className="mt-8 text-sm font-semibold">Raw AI response</h2>
      <div className="mt-1 text-xs text-[var(--muted)]">
        model <span className="font-mono">{rec.vision.model}</span> · available: {String(rec.vision.available)}
        {rec.vision.note ? ` · ${rec.vision.note}` : ""}
      </div>
      <button onClick={() => setShowRaw((v) => !v)} className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5">
        {showRaw ? "Hide" : "Show"} raw response
      </button>
      {showRaw ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 text-[11px] text-[var(--text)]">
          {rec.vision.raw || "(empty)"}
        </pre>
      ) : null}

      {zoom ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6" onClick={() => setZoom(null)}>
          <img src={zoom.src} alt={zoom.caption} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
          <div className="mt-3 text-sm text-slate-200">{zoom.caption}</div>
        </div>
      ) : null}
    </div>
  );
}
