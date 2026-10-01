"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EvidenceRecord } from "@/lib/types";
import { VerdictBadge } from "@/components/VerdictBadge";

export default function EvidencePage() {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/records")
      .then((r) => r.json())
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return records;
    return records.filter((r) =>
      [r.id, r.product.sku, r.product.name, r.overall.status, r.shipmentId, r.unitId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [q, records]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Evidence Log</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        Every inspection is saved as a tamper-evident record — photo fingerprints,
        the raw AI response and a timestamp. Searchable and exportable.
      </p>

      <div className="mt-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by SKU, product, record ID, status, shipment…"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Record</th>
              <th className="px-4 py-2 font-semibold">Product</th>
              <th className="px-4 py-2 font-semibold">SKU</th>
              <th className="px-4 py-2 font-semibold">When</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  {records.length === 0 ? (
                    <>
                      No records yet. Run one in the{" "}
                      <Link href="/prep" className="text-[var(--link)] hover:underline">
                        Prep Manager
                      </Link>
                      .
                    </>
                  ) : (
                    "No records match your search."
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/evidence/${r.id}`} className="font-mono text-xs text-[var(--link)] hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.product.name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.product.sku}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={r.overall.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
