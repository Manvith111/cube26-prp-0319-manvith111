"use client";

import { useEffect, useState } from "react";

interface ConfigView {
  hasKey: boolean;
  maskedKey: string;
  keySource: "config" | "env" | "none";
  model: string;
  modelSource: "config" | "env" | "default";
}

const MODEL_OPTIONS = [
  { id: "gemini-flash-latest", label: "Gemini Flash (latest) — fast, recommended" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest) — cheapest, most available" },
  { id: "gemini-pro-latest", label: "Gemini Pro (latest) — most capable" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash — latest pinned flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — stable" },
];

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function SettingsPage() {
  const [view, setView] = useState<ConfigView | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gemini-flash-latest");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  async function load() {
    try {
      const res = await fetch("/api/settings");
      const data: ConfigView = await res.json();
      setView(data);
      setModel(data.model);
    } catch {
      setToast({ kind: "err", text: "Could not load settings." });
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flash(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function onSave() {
    setBusy("save");
    const { ok } = await post({ action: "save", geminiApiKey: keyInput, visionModel: model });
    if (ok) {
      setKeyInput("");
      await load();
      flash({ kind: "ok", text: "Settings saved. The Prep Manager will use these now." });
    } else {
      flash({ kind: "err", text: "Could not save settings." });
    }
    setBusy(null);
  }

  async function onTest() {
    setBusy("test");
    // Empty key tells the server to test the stored/env key instead.
    const { ok, data } = await post({ action: "test", geminiApiKey: keyInput });
    const message = (data as { message?: string }).message || (ok ? "Key is valid." : "Key test failed.");
    flash({ kind: ok ? "ok" : "err", text: message });
    setBusy(null);
  }

  async function onClear() {
    setBusy("clear");
    const { ok } = await post({ action: "clear" });
    if (ok) {
      await load();
      flash({ kind: "ok", text: "Stored key removed." });
    }
    setBusy(null);
  }

  const sourceLabel: Record<string, string> = {
    config: "saved in app",
    env: "from environment",
    none: "not set",
    default: "default",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <div className="animate-fade-up">
        <span className="chip inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          Configuration
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Manage the Gemini API key and vision model that power the Prep Manager. The key is stored
          locally in <span className="font-mono text-[var(--text)]">data/config.json</span> and never
          leaves this machine except in calls to Google&apos;s Gemini API.
        </p>
      </div>

      {/* Current status */}
      <section className="animate-fade-up delay-1 mt-8 surface-card p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide">Current status</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatusTile
            label="Gemini API key"
            value={view?.hasKey ? view.maskedKey : "Not configured"}
            ok={Boolean(view?.hasKey)}
            note={view ? sourceLabel[view.keySource] : ""}
          />
          <StatusTile
            label="Vision model"
            value={view?.model ?? "—"}
            ok={Boolean(view?.model)}
            note={view ? sourceLabel[view.modelSource] : ""}
          />
        </div>
      </section>

      {/* Edit */}
      <section className="animate-fade-up delay-2 mt-6 surface-card p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide">Update configuration</h2>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Gemini API key
          </span>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={view?.hasKey ? "Enter a new key to replace the current one" : "Paste your Gemini API key"}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 font-mono text-sm outline-none transition-shadow focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              type="button"
              className="btn-ghost shrink-0 px-3 text-xs font-semibold text-[var(--text)]"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <span className="mt-1.5 block text-[11px] text-[var(--muted)]">
            Get a key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--link)] hover:underline"
            >
              aistudio.google.com/apikey
            </a>
            . Leave blank to keep the current key.
          </span>
        </label>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Vision model
          </span>
          <select
            value={MODEL_OPTIONS.some((m) => m.id === model) ? model : "__custom__"}
            onChange={(e) => e.target.value !== "__custom__" && setModel(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {!MODEL_OPTIONS.some((m) => m.id === model) ? (
              <option value="__custom__">{model} (current)</option>
            ) : null}
          </select>
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={onSave} disabled={busy !== null} className="btn-accent px-5 py-2.5 text-sm disabled:opacity-50">
            {busy === "save" ? "Saving…" : "Save settings"}
          </button>
          <button
            onClick={onTest}
            disabled={busy !== null || (!keyInput && !view?.hasKey)}
            className="btn-ghost px-4 py-2.5 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
          >
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
          {view?.keySource === "config" ? (
            <button
              onClick={onClear}
              disabled={busy !== null}
              className="ml-auto rounded-full px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              {busy === "clear" ? "Removing…" : "Remove stored key"}
            </button>
          ) : null}
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

function StatusTile({ label, value, ok, note }: { label: string; value: string; ok: boolean; note: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
          {ok ? "Ready" : "Set up"}
        </span>
      </div>
      <div className="mt-2 break-all font-mono text-sm text-[var(--text)]">{value}</div>
      {note ? <div className="mt-1 text-[11px] text-[var(--muted)]">{note}</div> : null}
    </div>
  );
}
