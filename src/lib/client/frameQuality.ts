// Best-frame selection: score a burst of frames and keep the sharpest, usable
// ones. Runs before the model so UNCERTAIN-with-retake stays meaningful — a
// blurry or glared frame is dropped rather than fed to Gemini. The sharpness
// metric is Laplacian variance (a standard, cheap focus measure); exposure is
// the mean luma, with a near-white count flagging glare.

import { toLuma, type FrameLike } from "./frame";

export type QualityIssue = "blurry" | "too_dark" | "glare";

export interface FrameScore {
  sharpness: number; // Laplacian variance (higher = sharper)
  brightness: number; // mean luma, 0-255
  glareFraction: number; // fraction of near-white pixels
  issues: QualityIssue[];
  usable: boolean;
}

export const QUALITY_THRESHOLDS = {
  minSharpness: 40,
  minBrightness: 40,
  maxBrightness: 225,
  nearWhite: 245, // luma at/above this counts as blown-out
  maxGlareFraction: 0.12,
};

function laplacianVariance(luma: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function scoreFrame(frame: FrameLike): FrameScore {
  const luma = toLuma(frame);
  const sharpness = laplacianVariance(luma, frame.width, frame.height);

  let total = 0;
  let nearWhite = 0;
  for (let i = 0; i < luma.length; i++) {
    total += luma[i];
    if (luma[i] >= QUALITY_THRESHOLDS.nearWhite) nearWhite++;
  }
  const brightness = luma.length ? total / luma.length : 0;
  const glareFraction = luma.length ? nearWhite / luma.length : 0;

  const issues: QualityIssue[] = [];
  if (sharpness < QUALITY_THRESHOLDS.minSharpness) issues.push("blurry");
  if (brightness < QUALITY_THRESHOLDS.minBrightness) issues.push("too_dark");
  if (brightness > QUALITY_THRESHOLDS.maxBrightness || glareFraction > QUALITY_THRESHOLDS.maxGlareFraction) {
    issues.push("glare");
  }

  return { sharpness, brightness, glareFraction, issues, usable: issues.length === 0 };
}

/**
 * Indices of the best up-to-`n` frames, sharpest first. Usable frames are
 * preferred; if none are usable, the sharpest frames are returned anyway so a
 * capture still produces something for the model to judge (as UNCERTAIN).
 */
export function pickBestFrames(frames: FrameLike[], n: number): number[] {
  if (frames.length === 0 || n <= 0) return [];
  const scored = frames.map((f, index) => ({ index, score: scoreFrame(f) }));
  const usable = scored.filter((s) => s.score.usable);
  const pool = usable.length > 0 ? usable : scored;
  pool.sort((a, b) => b.score.sharpness - a.score.sharpness);
  return pool.slice(0, n).map((s) => s.index);
}
