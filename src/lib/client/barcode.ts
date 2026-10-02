// Client-side barcode reading.
//
// Primary: the native BarcodeDetector API (fast, Chromium-only). Fallback:
// zxing-wasm (works in every browser and is more robust on small or angled
// codes), loaded lazily on first use so it never ships in the initial bundle.
// Callers get the first decoded value or null; manual entry stays a fallback.

interface DetectedBarcodeLike {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcodeLike[]>;
}

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

const FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];

function getCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

/** Whether the fast native detector exists (Chromium). zxing covers the rest. */
export function nativeBarcodeSupported(): boolean {
  return getCtor() !== null;
}

/** Barcode reading is always available thanks to the zxing-wasm fallback. */
export function barcodeSupported(): boolean {
  return true;
}

async function nativeDecode(source: CanvasImageSource): Promise<string | null> {
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    const detector = new Ctor({ formats: FORMATS });
    const results = await detector.detect(source);
    return results.length > 0 ? results[0].rawValue : null;
  } catch {
    return null;
  }
}

let zxingPrepared = false;

async function zxingDecode(input: Blob | ImageData): Promise<string | null> {
  try {
    const mod = await import("zxing-wasm/reader");
    // Load the wasm from our own origin (served from /public) instead of a CDN,
    // so it works offline and never silently fails to fetch.
    if (!zxingPrepared && typeof mod.prepareZXingModule === "function") {
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path,
        },
      });
      zxingPrepared = true;
    }
    const results = await mod.readBarcodes(input, { tryHarder: true, maxNumberOfSymbols: 1 });
    const hit = results.find((r) => r.text && r.text.trim().length > 0);
    return hit ? hit.text : null;
  } catch {
    return null;
  }
}

/** Rasterize any canvas image source to ImageData for the zxing fallback. */
function toImageData(source: CanvasImageSource): ImageData | null {
  if (typeof document === "undefined") return null;
  try {
    if (source instanceof HTMLCanvasElement) {
      return source.getContext("2d")?.getImageData(0, 0, source.width, source.height) ?? null;
    }
    let w = 0;
    let h = 0;
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      w = source.videoWidth;
      h = source.videoHeight;
    } else if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
      w = source.width;
      h = source.height;
    } else if (source instanceof HTMLImageElement) {
      w = source.naturalWidth;
      h = source.naturalHeight;
    }
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

/** Decode from a canvas/video/bitmap: native first, then zxing on the pixels. */
export async function detectBarcode(source: CanvasImageSource): Promise<string | null> {
  const native = await nativeDecode(source);
  if (native) return native;
  const img = toImageData(source);
  return img ? zxingDecode(img) : null;
}

/** Decode from an uploaded image file/blob: native (via bitmap) then zxing. */
export async function detectBarcodeFromBlob(blob: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(blob);
      const native = await nativeDecode(bitmap);
      bitmap.close?.();
      if (native) return native;
    } catch {
      /* fall through to zxing */
    }
  }
  return zxingDecode(blob);
}
