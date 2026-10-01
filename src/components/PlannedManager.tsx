export interface PlannedConfig {
  name: string;
  question: string;
  decisions: string[];
  summary: string;
  checks: string[];
}

export function PlannedManager({ config }: { config: PlannedConfig }) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{config.name}</h1>
        <span className="rounded bg-slate-600/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Planned
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{config.summary}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Question it answers
          </div>
          <p className="mt-2 text-sm">{config.question}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Decision
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {config.decisions.map((d) => (
              <span
                key={d}
                className="rounded bg-white/5 px-2 py-1 text-xs font-medium ring-1 ring-inset ring-[var(--border)]"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Checks it will perform
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {config.checks.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-2)] p-5 text-sm text-[var(--muted)]">
        This Manager is on the roadmap. It will write the{" "}
        <span className="text-[var(--text)]">same evidence record format</span> as
        the Prep Manager, so its inspections join the one evidence chain and feed
        the Recovery Manager automatically.
      </div>
    </div>
  );
}
