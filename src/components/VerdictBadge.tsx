import type { OverallStatus, Verdict } from "@/lib/types";

type AnyVerdict = Verdict | OverallStatus;

const STYLE: Record<string, string> = {
  PASS: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  FAIL: "bg-red-500/15 text-red-300 ring-red-500/40",
  UNCERTAIN: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  NOT_VERIFIABLE: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
  NOT_APPLICABLE: "bg-slate-700/20 text-slate-400 ring-slate-600/40",
};

const LABEL: Record<string, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  UNCERTAIN: "UNCERTAIN",
  NOT_VERIFIABLE: "NOT VERIFIABLE",
  NOT_APPLICABLE: "NOT APPLICABLE",
};

export function verdictLabel(v: AnyVerdict): string {
  return LABEL[v] ?? v;
}

export function VerdictBadge({ verdict }: { verdict: AnyVerdict }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
        STYLE[verdict] ?? STYLE.NOT_APPLICABLE
      }`}
    >
      {verdictLabel(verdict)}
    </span>
  );
}

const BANNER: Record<OverallStatus, { ring: string; bg: string; text: string; dot: string; label: string }> = {
  PASS: {
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
    label: "PASS",
  },
  FAIL: {
    ring: "ring-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-300",
    dot: "bg-red-400",
    label: "FAIL",
  },
  UNCERTAIN: {
    ring: "ring-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    dot: "bg-amber-400",
    label: "UNCERTAIN · NEEDS REVIEW",
  },
};

export function OverallBanner({
  status,
  reason,
  retake,
}: {
  status: OverallStatus;
  reason: string;
  retake?: string[];
}) {
  const s = BANNER[status];
  return (
    <div className={`rounded-xl p-5 ring-1 ring-inset ${s.bg} ${s.ring}`}>
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${s.dot}`} />
        <span className={`text-2xl font-bold tracking-tight ${s.text}`}>{s.label}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--text)]">{reason}</p>
      {retake && retake.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Re-photograph
          </div>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-[var(--text)]">
            {retake.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
