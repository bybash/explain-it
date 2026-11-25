import { describe, expect, it } from "vitest";
import { fitZoom, MAX_ZOOM, MIN_ZOOM, zoomStep } from "./diagram-zoom.ts";

describe("fitZoom", () => {
  it("shrinks a wide or tall drawing to its box, and grows a small one only so far", () => {
    expect(fitZoom({ width: 2000, height: 400 }, { width: 1000, height: 800 }, 1)).toBe(0.5);
    expect(fitZoom({ width: 400, height: 1600 }, { width: 1000, height: 800 }, 1)).toBe(0.5);
    expect(fitZoom({ width: 100, height: 100 }, { width: 1000, height: 800 }, 1.5)).toBe(1.5);
  });

  it("shows the drawing at its own size until both sizes are known", () => {
    expect(fitZoom({ width: 0, height: 0 }, { width: 1000, height: 800 }, 2)).toBe(1);
    expect(fitZoom({ width: 100, height: 100 }, { width: 0, height: 0 }, 2)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("goes in and out by the same amount, and stops at the ends", () => {
    expect(zoomStep(zoomStep(1, 1), -1)).toBeCloseTo(1);
    expect(zoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(zoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});
