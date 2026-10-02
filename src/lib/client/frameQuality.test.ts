import { describe, it, expect } from "vitest";
import { scoreFrame, pickBestFrames } from "./frameQuality";
import type { FrameLike } from "./frame";

const W = 20;
const H = 20;

function frame(fill: (x: number, y: number) => number): FrameLike {
  const data: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fill(x, y);
      data.push(v, v, v, 255);
    }
  }
  return { data, width: W, height: H };
}

// High-contrast checker (not near-white) => high Laplacian variance, mid exposure.
const SHARP = frame((x, y) => ((x + y) % 2 === 0 ? 60 : 200));
const BLURRY = frame(() => 128); // flat => ~0 variance
const DARK = frame(() => 10);
const GLARE = frame(() => 250);

describe("scoreFrame", () => {
  it("rates a high-contrast frame as sharp and usable", () => {
    const s = scoreFrame(SHARP);
    expect(s.sharpness).toBeGreaterThan(1000);
    expect(s.usable).toBe(true);
    expect(s.issues).toHaveLength(0);
  });

  it("flags a flat frame as blurry", () => {
    const s = scoreFrame(BLURRY);
    expect(s.issues).toContain("blurry");
    expect(s.usable).toBe(false);
  });

  it("flags an underexposed frame as too_dark", () => {
    expect(scoreFrame(DARK).issues).toContain("too_dark");
  });

  it("flags a blown-out frame as glare", () => {
    expect(scoreFrame(GLARE).issues).toContain("glare");
  });
});

describe("pickBestFrames", () => {
  it("returns the sharpest usable frame first", () => {
    const best = pickBestFrames([BLURRY, SHARP, DARK], 1);
    expect(best).toEqual([1]);
  });

  it("caps the result at n", () => {
    expect(pickBestFrames([SHARP, SHARP, SHARP], 2)).toHaveLength(2);
  });

  it("falls back to sharpest when none are usable", () => {
    const best = pickBestFrames([DARK, GLARE], 1);
    expect(best).toHaveLength(1);
  });

  it("returns nothing for an empty burst", () => {
    expect(pickBestFrames([], 4)).toEqual([]);
  });
});
