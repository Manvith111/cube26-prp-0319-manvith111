import { describe, it, expect } from "vitest";
import { createCaptureDetector } from "./motion";
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

const EMPTY = frame(() => 100);
// Top half turned white => ~50% of pixels differ from the empty baseline.
const UNIT = frame((_x, y) => (y < H / 2 ? 255 : 100));

const CFG = { settleFrames: 3 };

function learnBaseline(det: ReturnType<typeof createCaptureDetector>) {
  // First push sees no previous frame (motion = 1); then stillness accrues.
  for (let i = 0; i < 5; i++) det.push(EMPTY);
}

describe("createCaptureDetector", () => {
  it("learns an empty baseline once the scene is still", () => {
    const det = createCaptureDetector(CFG);
    expect(det.getState()).toBe("need_baseline");
    learnBaseline(det);
    expect(det.getState()).toBe("empty");
  });

  it("fires exactly once when a unit appears and settles", () => {
    const det = createCaptureDetector(CFG);
    learnBaseline(det);

    const fires: boolean[] = [];
    fires.push(det.push(UNIT).fired); // enter: empty -> settling
    fires.push(det.push(UNIT).fired); // still 1
    fires.push(det.push(UNIT).fired); // still 2
    const firing = det.push(UNIT); // still 3 -> fire
    fires.push(firing.fired);

    expect(firing.fired).toBe(true);
    expect(firing.state).toBe("captured");
    expect(fires.filter(Boolean)).toHaveLength(1);
  });

  it("does not fire again while the same unit stays in frame", () => {
    const det = createCaptureDetector(CFG);
    learnBaseline(det);
    for (let i = 0; i < 4; i++) det.push(UNIT); // first fire
    const after = [0, 1, 2, 3, 4].map(() => det.push(UNIT).fired);
    expect(after.some(Boolean)).toBe(false);
    expect(det.getState()).toBe("captured");
  });

  it("re-arms after the unit is removed", () => {
    const det = createCaptureDetector(CFG);
    learnBaseline(det);
    for (let i = 0; i < 4; i++) det.push(UNIT); // fire -> captured
    det.push(EMPTY); // scene returns to baseline -> empty
    expect(det.getState()).toBe("empty");

    const fires = [0, 1, 2, 3].map(() => det.push(UNIT).fired);
    expect(fires.filter(Boolean)).toHaveLength(1); // a second unit fires once
  });

  it("setBaseline arms immediately from the current scene", () => {
    const det = createCaptureDetector(CFG);
    det.setBaseline(EMPTY);
    expect(det.getState()).toBe("empty");
  });
});
