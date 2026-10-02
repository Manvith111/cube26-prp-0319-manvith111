// Object-change trigger: decides when a new unit has arrived and settled.
//
// Cheap, model-free gate that runs on every downscaled video frame so the
// expensive inspection (Gemini) fires exactly once per settled unit — never
// per frame. A small state machine learns an empty-bench baseline, waits for a
// unit to appear (differs from baseline) and stop moving (low frame-to-frame
// motion), fires once, then re-arms only after the unit is removed.

import { changedFraction, toLuma, type FrameLike } from "./frame";

export type CaptureState =
  | "need_baseline" // learning the empty scene
  | "empty" // armed; waiting for a unit to appear
  | "occupied_settling" // a unit is present; waiting for it to stop moving
  | "captured"; // fired; waiting for the unit to be removed

export interface DetectorConfig {
  motionThreshold: number; // per-pixel luma delta counted as "changed" (0-255)
  motionFraction: number; // frame-to-frame changed fraction above which = moving
  presenceFraction: number; // fraction differing from baseline = a unit is present
  settleFrames: number; // consecutive still frames required before firing
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  motionThreshold: 24,
  motionFraction: 0.02,
  presenceFraction: 0.04,
  settleFrames: 8,
};

export interface DetectorTick {
  state: CaptureState;
  motionScore: number; // changed fraction vs the previous frame
  presenceScore: number; // changed fraction vs the baseline
  fired: boolean; // true only on the single tick a capture is triggered
}

export interface CaptureDetector {
  push(frame: FrameLike): DetectorTick;
  setBaseline(frame: FrameLike): void;
  reset(): void;
  getState(): CaptureState;
}

export function createCaptureDetector(
  config: Partial<DetectorConfig> = {},
): CaptureDetector {
  const cfg: DetectorConfig = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  let prev: Uint8Array | null = null;
  let baseline: Uint8Array | null = null;
  let state: CaptureState = "need_baseline";
  let still = 0;

  function scores(luma: Uint8Array): { motion: number; presence: number } {
    const motion = prev ? changedFraction(luma, prev, cfg.motionThreshold) : 1;
    const presence = baseline
      ? changedFraction(luma, baseline, cfg.motionThreshold)
      : 0;
    return { motion, presence };
  }

  function advance(motion: number, presence: number, luma: Uint8Array): boolean {
    switch (state) {
      case "need_baseline":
        still = motion < cfg.motionFraction ? still + 1 : 0;
        if (still >= cfg.settleFrames) {
          baseline = luma;
          state = "empty";
          still = 0;
        }
        return false;
      case "empty":
        if (presence >= cfg.presenceFraction) {
          state = "occupied_settling";
          still = 0;
        }
        return false;
      case "occupied_settling":
        if (presence < cfg.presenceFraction) {
          state = "empty";
          still = 0;
        } else if (motion < cfg.motionFraction) {
          still += 1;
          if (still >= cfg.settleFrames) {
            state = "captured";
            still = 0;
            return true;
          }
        } else {
          still = 0;
        }
        return false;
      case "captured":
        if (presence < cfg.presenceFraction) {
          state = "empty";
          still = 0;
        }
        return false;
    }
  }

  return {
    push(frame) {
      const luma = toLuma(frame);
      const { motion, presence } = scores(luma);
      const fired = advance(motion, presence, luma);
      prev = luma;
      return { state, motionScore: motion, presenceScore: presence, fired };
    },
    setBaseline(frame) {
      baseline = toLuma(frame);
      prev = baseline;
      state = "empty";
      still = 0;
    },
    reset() {
      prev = null;
      baseline = null;
      state = "need_baseline";
      still = 0;
    },
    getState() {
      return state;
    },
  };
}
