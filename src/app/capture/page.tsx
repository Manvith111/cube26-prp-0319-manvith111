"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCaptureDetector, type CaptureState } from "@/lib/client/motion";
import { pickBestFrames } from "@/lib/client/frameQuality";
import { detectBarcode } from "@/lib/client/barcode";
import { findProductFromPhotos } from "@/lib/client/find";
import type { CatalogEntry, EvidenceRecord } from "@/lib/types";
import { OverallBanner } from "@/components/VerdictBadge";

// Detection runs on a cheap downscaled frame; the model only sees the sharp
// full-size burst grabbed once a unit settles.
const DETECT_W = 160;
const DETECT_H = 120;
const DETECT_INTERVAL_MS = 125;
const CAPTURE_MAX_W = 1280;
const BURST_SIZE = 5;
const BURST_GAP_MS = 70;
const MAX_CAPTURE_PHOTOS = 4;
// A second, slower loop reads the barcode off the live frame and fires a capture
// the moment a code decodes — this is what makes a webcam OR an uploaded video
// inspect automatically, without waiting for the motion detector to settle.
const SCAN_MAX_W = 1024;
const SCAN_INTERVAL_MS = 700;
const RESCAN_COOLDOWN_MS = 15000; // don't re-fire the same code within this window
// Motion trigger: fire a capture after the scene moves and then holds still —
// works even when a unit is already in frame at start (no empty baseline needed).
const MOTION_ON = 0.03; // frame-to-frame change that counts as "moving"
const MOTION_OFF = 0.012; // below this = "still"
const MOTION_SETTLE_FRAMES = 6; // consecutive still frames (~0.75s) before firing
const CYCLE_COOLDOWN_MS = 3000; // ignore motion re-triggers right after a capture

type Phase = "idle" | "starting" | "watching" | "capturing" | "identifying" | "inspecting" | "done";
type Source = "webcam" | "video";

interface BurstFrame {
  image: ImageData;
  canvas: HTMLCanvasElement;
  base64: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow it and press Start again.";
  if (name === "NotFoundError") return "No camera was found on this device.";
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return "This browser has no camera access (needs a secure context).";
  }
  return e instanceof Error ? e.message : "Could not start the camera.";
}

export default function CapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<ReturnType<typeof createCaptureDetector> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const autoRef = useRef(true);
  const stationIdRef = useRef("");
  const selectedEntryRef = useRef<CatalogEntry | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false);
  const lastCodeRef = useRef<string | null>(null);
  const lastFireRef = useRef(0);
  const movedRef = useRef(false);
  const stillRef = useRef(0);
  const lastCycleRef = useRef(0);

  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [detState, setDetState] = useState<CaptureState>("need_baseline");
  const [meters, setMeters] = useState({ motion: 0, presence: 0 });
  const [autoMode, setAutoMode] = useState(true);
  const [stationId, setStationId] = useState("");
  const [scanned, setScanned] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [source, setSource] = useState<Source>("webcam");

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => setCatalog(d.entries ?? []))
      .catch(() => {});
  }, []);

  // Mirror the fields the auto-fired cycle reads into refs, so the long-lived
  // detection interval never closes over a stale product or station.
  useEffect(() => {
    selectedEntryRef.current = catalog.find((e) => e.sku === selectedSku) ?? null;
  }, [catalog, selectedSku]);

  useEffect(() => {
    stationIdRef.current = stationId;
  }, [stationId]);

  async function lookupCatalog(code: string): Promise<CatalogEntry | null> {
    const res = await fetch(`/api/catalog?code=${encodeURIComponent(code)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Catalog lookup failed (${res.status})`);
    return (await res.json()) as CatalogEntry;
  }

  async function runInspect(entry: CatalogEntry, photos: BurstFrame[], reason: string): Promise<EvidenceRecord> {
    const res = await fetch("/api/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: entry.product,
        photos: photos.map((p, i) => ({ filename: `capture-${i + 1}.jpg`, mediaType: "image/jpeg", dataBase64: p.base64 })),
        rulePackId: entry.rulePackId,
        rulePackVersion: entry.rulePackVersion,
        notes: `auto-capture (${reason})`,
        stationId: stationIdRef.current.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Inspection failed (${res.status})`);
    }
    return (await res.json()) as EvidenceRecord;
  }

  const grabBurst = useCallback(async (): Promise<BurstFrame[]> => {
    const v = videoRef.current;
    const c = captureCanvasRef.current;
    if (!v || !c) return [];
    const vw = v.videoWidth || 640;
    const vh = v.videoHeight || 480;
    const scale = Math.min(1, CAPTURE_MAX_W / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return [];
    const out: BurstFrame[] = [];
    for (let i = 0; i < BURST_SIZE; i++) {
      ctx.drawImage(v, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const copy = document.createElement("canvas");
      copy.width = w;
      copy.height = h;
      copy.getContext("2d")?.putImageData(image, 0, 0);
      const dataUrl = copy.toDataURL("image/jpeg", 0.85);
      out.push({ image, canvas: copy, base64: dataUrl.split(",")[1] ?? "" });
      await sleep(BURST_GAP_MS);
    }
    return out;
  }, []);

  const runCycle = useCallback(
    async (reason: "auto" | "manual", preCode: string | null = null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setPhase("capturing");
      try {
        const burst = await grabBurst();
        if (burst.length === 0) throw new Error("No frames captured from the camera.");
        const best = pickBestFrames(burst.map((b) => b.image), MAX_CAPTURE_PHOTOS).map((i) => burst[i]);

        let code: string | null = preCode;
        if (!code) {
          for (const b of best) {
            code = await detectBarcode(b.canvas);
            if (code) break;
          }
        }
        setScanned(code);
        if (code) {
          lastCodeRef.current = code;
          lastFireRef.current = Date.now();
        }

        let entry = code ? await lookupCatalog(code) : null;
        let aiNote: string | null = null;

        // Find agent: if no barcode matched, let the AI read the product and
        // search the catalog across codes + name + category for the best match.
        if (!entry) {
          setPhase("identifying");
          const found = await findProductFromPhotos(
            best.map((b) => ({ mediaType: "image/jpeg", dataBase64: b.base64 })),
          );
          if (found.match) {
            entry = found.match;
            setScanned(found.extracted?.codes?.[0] ?? found.match.sku);
          } else if (!found.available) {
            aiNote = found.note ?? "AI identification is unavailable.";
          }
        }

        if (entry) {
          setSelectedSku(entry.sku); // reflect the identified product in the picker
        } else if (selectedEntryRef.current) {
          entry = selectedEntryRef.current; // fall back to the manually chosen product
        }
        if (!entry) {
          setError(
            aiNote
              ? `AI identification unavailable: ${aiNote}`
              : "Couldn’t find a matching product in the catalog. Hold the label steadier/closer, add the product on the Catalog page, or pick one below.",
          );
          setPhase("watching");
          return;
        }

        setPhase("inspecting");
        const rec = await runInspect(entry, best, reason);
        setResult(rec);
        setPhase("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("watching");
      } finally {
        busyRef.current = false;
        lastCycleRef.current = Date.now();
      }
    },
    // lookupCatalog/runInspect read only refs + state setters, so the callback
    // stays stable and the detection interval never holds a stale version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grabBurst],
  );

  const tick = useCallback(() => {
    const v = videoRef.current;
    const c = detectCanvasRef.current;
    const det = detectorRef.current;
    if (!v || !c || !det || v.readyState < 2) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, DETECT_W, DETECT_H);
    const frame = ctx.getImageData(0, 0, DETECT_W, DETECT_H);
    const t = det.push(frame);
    setDetState(t.state);
    setMeters({ motion: t.motionScore, presence: t.presenceScore });

    // Simple, reliable motion trigger: something moved, then held still → fire.
    // Doesn't rely on an empty-scene baseline, so a unit already in frame works.
    if (!autoRef.current || busyRef.current) return;
    if (Date.now() - lastCycleRef.current < CYCLE_COOLDOWN_MS) return;
    if (t.motionScore > MOTION_ON) {
      movedRef.current = true;
      stillRef.current = 0;
    } else if (movedRef.current && t.motionScore < MOTION_OFF) {
      stillRef.current += 1;
      if (stillRef.current >= MOTION_SETTLE_FRAMES) {
        movedRef.current = false;
        stillRef.current = 0;
        void runCycle("auto");
      }
    }
  }, [runCycle]);

  // Slower loop: read the barcode off the current frame and auto-capture when a
  // new code decodes. Drives automatic inspection for both webcam and video.
  const scanForBarcode = useCallback(async () => {
    if (!autoRef.current || busyRef.current || scanningRef.current) return;
    const v = videoRef.current;
    const c = scanCanvasRef.current;
    if (!v || !c || v.readyState < 2) return;
    scanningRef.current = true;
    try {
      const vw = v.videoWidth || 640;
      const vh = v.videoHeight || 480;
      const scale = Math.min(1, SCAN_MAX_W / vw);
      c.width = Math.round(vw * scale);
      c.height = Math.round(vh * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const code = await detectBarcode(c);
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastFireRef.current < RESCAN_COOLDOWN_MS) return;
      lastCodeRef.current = code;
      lastFireRef.current = now;
      setScanned(code);
      void runCycle("auto", code);
    } finally {
      scanningRef.current = false;
    }
  }, [runCycle]);

  const startLoops = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    intervalRef.current = setInterval(tick, DETECT_INTERVAL_MS);
    scanIntervalRef.current = setInterval(scanForBarcode, SCAN_INTERVAL_MS);
  }, [tick, scanForBarcode]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    intervalRef.current = null;
    scanIntervalRef.current = null;
    lastCodeRef.current = null;
    lastFireRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      if (objectUrlRef.current) {
        v.removeAttribute("src");
        v.load();
      }
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setActive(false);
    setPhase("idle");
    setDetState("need_baseline");
  }, []);

  async function startCamera() {
    setError(null);
    setResult(null);
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-media");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = createCaptureDetector();
      setActive(true);
      setPhase("watching");
      startLoops();
    } catch (e) {
      setError(cameraError(e));
      setPhase("idle");
    }
  }

  function onPickVideo(file: File | null) {
    if (!file) return;
    const v = videoRef.current;
    if (!v) return;
    setError(null);
    setResult(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    v.srcObject = null;
    v.src = url;
    v.loop = false;
    v.muted = true;
    void v.play().catch(() => {});
    detectorRef.current = createCaptureDetector();
    setActive(true);
    setPhase("watching");
    startLoops();
    if (videoFileRef.current) videoFileRef.current.value = "";
  }

  function selectSource(next: Source) {
    if (next === source) return;
    if (active) stopCamera();
    setSource(next);
    setResult(null);
    setError(null);
  }

  function setEmptyBackground() {
    const v = videoRef.current;
    const c = detectCanvasRef.current;
    const det = detectorRef.current;
    if (!v || !c || !det) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, DETECT_W, DETECT_H);
    det.setBaseline(ctx.getImageData(0, 0, DETECT_W, DETECT_H));
    setDetState("empty");
  }

  function toggleAuto() {
    setAutoMode((a) => {
      autoRef.current = !a;
      return !a;
    });
  }

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="animate-fade-up">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Capture Station</h1>
          <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-400">
            Live
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Point a camera at the prep area. When a unit arrives and settles, it auto-captures the sharpest frames,
          reads the barcode, pulls its criteria from the catalog, and runs the same{" "}
          <span className="gradient-text font-semibold">observe → decide</span> engine as the Prep Manager — no clicks.
        </p>
      </header>

      <SourceToggle source={source} onSelect={selectSource} disabled={active} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface-card overflow-hidden p-0">
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              controls={source === "video" && active}
              className="h-full w-full object-contain"
            />
            {!active ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-sm text-[var(--muted)]">
                <span className="text-4xl">{source === "video" ? "⏵" : "◉"}</span>
                <span>
                  {source === "video"
                    ? "Choose a video file to run the pipeline over it."
                    : "Camera is off. Press Start to begin watching."}
                </span>
              </div>
            ) : (
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <StatePill state={detState} phase={phase} />
              </div>
            )}
            <div className="absolute right-3 top-3">
              <VerdictLight phase={phase} status={result?.overall.status ?? null} />
            </div>
          </div>
          {active ? (
            <div className="grid grid-cols-2 gap-4 p-4">
              <Meter label="Motion" value={meters.motion} />
              <Meter label="Presence" value={meters.presence} />
            </div>
          ) : null}
        </section>

        <section className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {!active ? (
              source === "webcam" ? (
                <button onClick={startCamera} className="btn-accent px-4 py-2 text-sm" disabled={phase === "starting"}>
                  {phase === "starting" ? "Starting…" : "Start camera"}
                </button>
              ) : (
                <button onClick={() => videoFileRef.current?.click()} className="btn-accent px-4 py-2 text-sm">
                  Choose video file
                </button>
              )
            ) : (
              <button onClick={stopCamera} className="btn-ghost px-4 py-2 text-sm font-semibold text-[var(--text)]">
                Stop
              </button>
            )}
            <button
              onClick={() => runCycle("manual")}
              disabled={!active || phase === "capturing" || phase === "inspecting"}
              className="btn-ghost px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-40"
            >
              Capture now
            </button>
            <button
              onClick={setEmptyBackground}
              disabled={!active}
              className="btn-ghost px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-40"
            >
              Set empty background
            </button>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">Auto-capture</span>
              <span className="block text-[11px] text-[var(--muted)]">Fire when motion settles or a barcode is read</span>
            </span>
            <input type="checkbox" checked={autoMode} onChange={toggleAuto} className="h-4 w-4 accent-[var(--accent)]" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              Product (fallback when the barcode can’t be read)
            </span>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
            >
              <option value="">Auto — identify by barcode</option>
              {catalog.map((e) => (
                <option key={e.sku} value={e.sku}>
                  {e.sku} — {e.product.name}
                </option>
              ))}
            </select>
            {catalog.length === 0 ? (
              <span className="mt-1 block text-[11px] text-[var(--muted)]">
                No catalog yet — import products on the Catalog page first.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">Station ID (optional)</span>
            <input
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="STATION-01"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
            />
          </label>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[11px] text-[var(--muted)]">
            <div>
              Phase: <span className="font-mono text-[var(--text)]">{phase}</span>
            </div>
            {scanned ? (
              <div className="mt-1">
                Auto-ID: <span className="font-mono text-[var(--text)]">{scanned}</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {error ? (
        <div className="animate-fade-up mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      ) : null}

      {result ? <ResultSummary result={result} /> : null}

      <input
        ref={videoFileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)}
      />
      <canvas ref={detectCanvasRef} width={DETECT_W} height={DETECT_H} className="hidden" />
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={scanCanvasRef} className="hidden" />
    </div>
  );
}

function SourceToggle({
  source,
  onSelect,
  disabled,
}: {
  source: Source;
  onSelect: (s: Source) => void;
  disabled: boolean;
}) {
  const seg = (active: boolean) =>
    `rounded-lg px-4 py-1.5 transition-colors ${
      active
        ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] font-semibold text-[var(--text)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]"
        : "text-[var(--muted)] hover:text-[var(--text)]"
    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
  return (
    <div className="animate-fade-up delay-1 mt-5 inline-flex rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-1 text-sm">
      <button type="button" disabled={disabled} onClick={() => onSelect("webcam")} className={seg(source === "webcam")}>
        Webcam / phone
      </button>
      <button type="button" disabled={disabled} onClick={() => onSelect("video")} className={seg(source === "video")}>
        Video file
      </button>
      <span
        className="cursor-not-allowed px-4 py-1.5 text-[var(--muted)]"
        title="Enterprise IP cameras post frames in via a small edge agent — a later phase."
      >
        IP camera · soon
      </span>
    </div>
  );
}

function StatePill({ state, phase }: { state: CaptureState; phase: Phase }) {
  const working =
    phase === "capturing" ? "Capturing…" : phase === "identifying" ? "Identifying…" : phase === "inspecting" ? "Inspecting…" : null;
  const label = working ?? STATE_LABEL[state];
  return (
    <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
      {label}
    </span>
  );
}

const STATE_LABEL: Record<CaptureState, string> = {
  need_baseline: "Learning the bench…",
  empty: "Waiting for a unit",
  occupied_settling: "Unit detected — hold still",
  captured: "Captured — remove unit",
};

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--panel)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function VerdictLight({ phase, status }: { phase: Phase; status: string | null }) {
  const working = phase === "capturing" || phase === "identifying" || phase === "inspecting";
  const tone = working
    ? { dot: "bg-amber-400", ring: "ring-amber-400/40", text: "Working" }
    : status === "PASS"
      ? { dot: "bg-emerald-400", ring: "ring-emerald-400/40", text: "PASS" }
      : status === "FAIL"
        ? { dot: "bg-red-400", ring: "ring-red-400/40", text: "FAIL" }
        : status === "UNCERTAIN"
          ? { dot: "bg-amber-400", ring: "ring-amber-400/40", text: "UNCERTAIN" }
          : { dot: "bg-slate-500", ring: "ring-slate-500/30", text: "Idle" };
  return (
    <span className={`flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white ring-1 ${tone.ring} backdrop-blur`}>
      <span className={`h-3 w-3 rounded-full ${tone.dot} ${working ? "animate-pulse" : ""}`} />
      {tone.text}
    </span>
  );
}

function ResultSummary({ result }: { result: EvidenceRecord }) {
  const judged = result.checks.filter((c) => c.applicable && c.verifiable);
  const fails = judged.filter((c) => c.verdict === "FAIL").length;
  const uncertain = judged.filter((c) => c.verdict === "UNCERTAIN").length;
  return (
    <div className="animate-fade-up mt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide">Latest capture</h2>
        <div className="flex gap-2">
          <a href={`/api/records/${result.id}/export`} className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
            ⤓ Record
          </a>
          <a href="/evidence" className="btn-ghost px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
            Evidence Log →
          </a>
        </div>
      </div>

      <OverallBanner status={result.overall.status} reason={result.overall.reason} retake={result.overall.retake} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Product" value={result.product.sku} />
        <Stat label="Checks judged" value={`${judged.length}`} />
        <Stat label="Fails / uncertain" value={`${fails} / ${uncertain}`} />
      </div>

      <div className="text-xs text-[var(--muted)]">
        Record <span className="font-mono text-[var(--text)]">{result.id}</span> ·{" "}
        {new Date(result.createdAt).toLocaleString()} · rule pack{" "}
        <span className="font-mono">
          {result.rulePack?.id}@{result.rulePack?.version}
        </span>{" "}
        · model <span className="font-mono">{result.vision.model}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-[var(--text)]">{value}</div>
    </div>
  );
}
