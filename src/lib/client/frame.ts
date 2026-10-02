// Shared frame primitives for the client-side capture pipeline.
//
// A FrameLike is the minimal shape of a canvas ImageData — plain data so the
// motion and quality modules stay pure and unit-testable without a DOM.

export interface FrameLike {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

/** Convert an RGBA frame to a single-channel luma (brightness) buffer. */
export function toLuma(frame: FrameLike): Uint8Array {
  const { data, width, height } = frame;
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return out;
}

/** Fraction of pixels whose luma differs by more than `threshold` (0..1). */
export function changedFraction(a: Uint8Array, b: Uint8Array, threshold: number): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > threshold) changed++;
  }
  return changed / a.length;
}
