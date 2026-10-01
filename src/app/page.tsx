import Link from "next/link";
import { readAll } from "@/lib/store";
import { VerdictBadge } from "@/components/VerdictBadge";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const records = readAll();
  const total = records.length;
  const pass = records.filter((r) => r.overall.status === "PASS").length;
  const fail = records.filter((r) => r.overall.status === "FAIL").length;
  const uncertain = records.filter((r) => r.overall.status === "UNCERTAIN").length;
  const recent = records.slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      {/* Hero */}
      <section className="animate-fade-up glow-border overflow-hidden p-[1px]">
        <div className="relative overflow-hidden rounded-[calc(var(--radius)-1px)] bg-[var(--panel)] px-7 py-10 md:px-10 md:py-12">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[color-mix(in_oklab,var(--accent)_28%,transparent)] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-[color-mix(in_oklab,var(--grad-1)_30%,transparent)] blur-3xl" />
          <div className="relative">
            <span className="chip inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
              <span className="ring-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Prep Manager · live on Gemini
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              Where evidence <span className="gradient-text">decides.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              One platform, five AI Managers, one evidence chain. Every inspection becomes a
              timestamped, tamper-evident record — and Recovery turns those records into money.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/prep" className="btn-accent px-5 py-2.5 text-sm">
                Run a prep inspection →
              </Link>
              <Link href="/evidence" className="btn-ghost px-5 py-2.5 text-sm font-semibold text-[var(--text)]">
                View evidence log
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total inspections" value={total} tone="var(--text)" delay="delay-1" accent="var(--grad-2)" />
        <Stat label="Pass" value={pass} tone="#34d399" delay="delay-2" accent="#34d399" />
        <Stat label="Fail" value={fail} tone="#f87171" delay="delay-3" accent="#f87171" />
        <Stat label="Uncertain" value={uncertain} tone="#fbbf24" delay="delay-4" accent="#fbbf24" />
      </div>

      {/* Recent */}
      <div className="animate-fade-up delay-3 mt-8 surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">Recent inspections</h2>
          <Link href="/evidence" className="text-xs font-semibold text-[var(--link)] hover:underline">
            View evidence log →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--muted)]">
            No inspections yet. Head to the{" "}
            <Link href="/prep" className="text-[var(--link)] hover:underline">
              Prep Manager
            </Link>{" "}
            to run your first one.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/evidence/${r.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--grad-2)] to-[var(--grad-1)] text-xs font-bold text-white">
                      {(r.product.name || r.product.sku || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.product.name || r.product.sku}</div>
                      <div className="truncate font-mono text-xs text-[var(--muted)]">
                        {r.product.sku} · {r.id} · {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <VerdictBadge verdict={r.overall.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Principles */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Principle title="UNCERTAIN is valid" delay="delay-1">
          A blurry or cropped photo yields UNCERTAIN with retake guidance — never a guess.
        </Principle>
        <Principle title="AI observes, rules decide" delay="delay-2">
          The model only describes what it sees. Fixed logic turns that into the verdict, so the same
          evidence always gives the same result.
        </Principle>
        <Principle title="Every verdict is traceable" delay="delay-3">
          Each result cites a photo, a location, and the exact rule quote it was judged against.
        </Principle>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  delay,
  accent,
}: {
  label: string;
  value: number;
  tone: string;
  delay: string;
  accent: string;
}) {
  return (
    <div className={`animate-fade-up ${delay} surface-card hover-lift relative overflow-hidden p-5`}>
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: accent, boxShadow: `0 0 16px 0 ${accent}` }}
      />
      <div className="text-4xl font-black tracking-tight" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-[var(--muted)]">{label}</div>
    </div>
  );
}

function Principle({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: string;
}) {
  return (
    <div className={`animate-fade-up ${delay} surface-card hover-lift p-5`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        {title}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{children}</p>
    </div>
  );
}
