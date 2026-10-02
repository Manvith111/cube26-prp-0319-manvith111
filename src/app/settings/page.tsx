"use client";

import { useEffect, useState } from "react";

type ProviderId = "gemini" | "anthropic" | "openai";

interface ProviderMeta {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: { id: string; label: string }[];
  keyHint: string;
}

interface CredentialView {
  id: string;
  provider: ProviderId;
  providerLabel: string;
  model: string;
  label?: string;
  enabled: boolean;
  maskedKey: string;
  source: "config" | "env";
}

interface ConfigView {
  credentials: CredentialView[];
  providers: ProviderMeta[];
  hasAnyKey: boolean;
}

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function SettingsPage() {
  const [view, setView] = useState<ConfigView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Add-credential form state
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [model, setModel] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [label, setLabel] = useState("");
  const [showKey, setShowKey] = useState(false);

  const providerMeta = view?.providers.find((p) => p.id === provider);

  async function load() {
    try {
      const res = await fetch("/api/settings");
      const data: ConfigView = await res.json();
      setView(data);
      if (!model && data.providers[0]) {
        setProvider(data.providers[0].id);
        setModel(data.providers[0].defaultModel);
      }
    } catch {
      flash({ kind: "err", text: "Could not load settings." });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4500);
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  function onPickProvider(id: ProviderId) {
    setProvider(id);
    const meta = view?.providers.find((p) => p.id === id);
    setModel(meta?.defaultModel ?? "");
  }

  async function onAdd() {
    if (!keyInput.trim()) return flash({ kind: "err", text: "Paste an API key first." });
    setBusy("add");
    const { ok, data } = await post({ action: "add", provider, apiKey: keyInput, model, label });
    if (ok) {
      setView(data as unknown as ConfigView);
      setKeyInput("");
      setLabel("");
      flash({ kind: "ok", text: "Key added to the pool." });
    } else {
      flash({ kind: "err", text: (data.error as string) || "Could not add key." });
    }
    setBusy(null);
  }

  async function onTestNew() {
    setBusy("test-new");
    const { ok, data } = await post({ action: "test", provider, apiKey: keyInput, model });
    flash({ kind: ok ? "ok" : "err", text: (data.message as string) || (ok ? "Key is valid." : "Test failed.") });
    setBusy(null);
  }

  async function onToggle(c: CredentialView) {
    setBusy(c.id);
    const { ok, data } = await post({ action: "update", id: c.id, enabled: !c.enabled });
    if (ok) setView(data as unknown as ConfigView);
    else flash({ kind: "err", text: (data.error as string) || "Update failed." });
    setBusy(null);
  }

  async function onTestExisting(c: CredentialView) {
    setBusy(`test-${c.id}`);
    const { ok, data } = await post({ action: "test", provider: c.provider, id: c.id, model: c.model });
    flash({ kind: ok ? "ok" : "err", text: `${c.providerLabel}: ${(data.message as string) || (ok ? "valid" : "failed")}` });
    setBusy(null);
  }

  async function onRemove(c: CredentialView) {
    setBusy(c.id);
    const { ok, data } = await post({ action: "remove", id: c.id });
    if (ok) {
      setView(data as unknown as ConfigView);
      flash({ kind: "ok", text: "Key removed." });
    } else {
      flash({ kind: "err", text: (data.error as string) || "Remove failed." });
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <div className="animate-fade-up">
        <span className="chip inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          Configuration
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">AI providers</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Add one or more provider keys. The inspector tries them <strong>in order</strong> and fails
          over automatically — so several keys (even across Gemini, Claude and OpenAI) share the load and
          dodge per-key rate limits. Keys are stored locally in{" "}
          <span className="font-mono text-[var(--text)]">data/config.json</span> and only leave this
          machine in calls to the provider you configured.
        </p>
      </div>

      {/* Configured keys */}
      <section className="animate-fade-up delay-1 mt-8 surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide">Key pool</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              view?.hasAnyKey ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${view?.hasAnyKey ? "bg-emerald-400" : "bg-amber-400"}`} />
            {view?.hasAnyKey ? "Ready" : "No keys"}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {view?.credentials.length ? (
            view.credentials.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                    {c.providerLabel}
                  </span>
                  <span className="font-mono text-sm text-[var(--text)]">{c.maskedKey || "—"}</span>
                  <span className="text-[11px] text-[var(--muted)]">{c.model}</span>
                  {c.source === "env" ? (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--muted)]">from environment</span>
                  ) : null}
                  <span
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      c.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-[var(--muted)]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-[var(--muted)]"}`} />
                    {c.enabled ? "Active" : "Off"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onTestExisting(c)}
                    disabled={busy !== null}
                    className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                  >
                    {busy === `test-${c.id}` ? "Testing…" : "Test"}
                  </button>
                  {c.source === "config" ? (
                    <>
                      <button
                        onClick={() => onToggle(c)}
                        disabled={busy !== null}
                        className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                      >
                        {c.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => onRemove(c)}
                        disabled={busy !== null}
                        className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="ml-auto self-center text-[11px] text-[var(--muted)]">
                      Set via env var — edit your environment to change.
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              No keys yet. Add one below — without a key the app still runs and every check returns
              <span className="font-semibold"> UNCERTAIN</span>.
            </p>
          )}
        </div>
      </section>

      {/* Add a key */}
      <section className="animate-fade-up delay-2 mt-6 surface-card p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide">Add a provider key</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Provider</span>
            <select
              value={provider}
              onChange={(e) => onPickProvider(e.target.value as ProviderId)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
            >
              {view?.providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Model</span>
            <select
              value={providerMeta?.models.some((m) => m.id === model) ? model : "__custom__"}
              onChange={(e) => e.target.value !== "__custom__" && setModel(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
            >
              {providerMeta?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              {providerMeta && !providerMeta.models.some((m) => m.id === model) ? (
                <option value="__custom__">{model} (current)</option>
              ) : null}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">API key</span>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste the API key"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 font-mono text-sm outline-none transition-shadow focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
            />
            <button onClick={() => setShowKey((s) => !s)} type="button" className="btn-ghost shrink-0 px-3 text-xs font-semibold text-[var(--text)]">
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {providerMeta ? (
            <span className="mt-1.5 block text-[11px] text-[var(--muted)]">
              Get a key at{" "}
              <a href={`https://${providerMeta.keyHint}`} target="_blank" rel="noreferrer" className="text-[var(--link)] hover:underline">
                {providerMeta.keyHint}
              </a>
              .
            </span>
          ) : null}
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Label (optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. personal key, work key"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
          />
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={onAdd} disabled={busy !== null} className="btn-accent px-5 py-2.5 text-sm disabled:opacity-50">
            {busy === "add" ? "Adding…" : "Add key"}
          </button>
          <button
            onClick={onTestNew}
            disabled={busy !== null || !keyInput.trim()}
            className="btn-ghost px-4 py-2.5 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
          >
            {busy === "test-new" ? "Testing…" : "Test before adding"}
          </button>
        </div>

        {toast ? (
          <div
            className={`animate-fade-up mt-4 rounded-xl border px-4 py-3 text-sm ${
              toast.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/40 bg-red-500/10 text-red-400"
            }`}
          >
            {toast.text}
          </div>
        ) : null}
      </section>
    </div>
  );
}
