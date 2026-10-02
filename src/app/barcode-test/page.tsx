"use client";

// Diagnostic: renders a real Code-128 barcode, then decodes it through the app's
// own reader (native BarcodeDetector → zxing-wasm with the self-hosted wasm).
// Visit /barcode-test to confirm barcode reading works in this browser.

import { useEffect, useState } from "react";
import { detectBarcodeFromBlob, nativeBarcodeSupported } from "@/lib/client/barcode";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

export default function BarcodeTestPage() {
  const [status, setStatus] = useState("starting…");
  const [result, setResult] = useState("running…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading JsBarcode…");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js");
        const JsBarcode = (window as unknown as { JsBarcode: (c: HTMLCanvasElement, v: string, o: object) => void }).JsBarcode;
        const expected = "X00PASS001";
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, expected, { format: "CODE128", displayValue: false });
        const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b as Blob), "image/png"));
        setStatus(`native BarcodeDetector: ${nativeBarcodeSupported() ? "available" : "absent → using zxing-wasm"} · decoding…`);
        const decoded = await detectBarcodeFromBlob(blob);
        if (cancelled) return;
        setResult(decoded === expected ? `PASS — decoded "${decoded}"` : `FAIL — got ${JSON.stringify(decoded)}, expected ${expected}`);
      } catch (e) {
        if (!cancelled) setResult("ERROR: " + (e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Barcode reader self-test</h1>
      <p style={{ color: "#888" }}>{status}</p>
      <p data-testid="result" style={{ fontSize: 16, fontWeight: 700 }}>{result}</p>
    </div>
  );
}
