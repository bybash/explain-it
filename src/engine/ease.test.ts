import { describe, expect, it } from "vitest";
import { EASE_NAMES, EASES } from "./ease.ts";

describe("eases", () => {
  it.each(EASE_NAMES)("%s starts at 0 and ends at 1", (name) => {
    expect(EASES[name](0)).toBeCloseTo(0, 10);
    expect(EASES[name](1)).toBeCloseTo(1, 10);
  });

  it.each(EASE_NAMES.filter((name) => name !== "outBack"))("%s never goes backwards", (name) => {
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = EASES[name](i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
  });

  it("has the expected shapes", () => {
    expect(EASES.linear(0.25)).toBe(0.25);
    expect(EASES.inOutQuad(0.5)).toBeCloseTo(0.5);
    expect(EASES.outCubic(0.5)).toBeCloseTo(0.875);
    expect(EASES.inQuad(0.5)).toBeCloseTo(0.25);
  });

  it("matches the textbook closed forms", () => {
    const closedForms: Record<string, (p: number) => number> = {
      linear: (p) => p,
      inQuad: (p) => p * p,
      outQuad: (p) => 1 - (1 - p) ** 2,
      inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
      inCubic: (p) => p ** 3,
      outCubic: (p) => 1 - (1 - p) ** 3,
      inOutCubic: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
      inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
      outBack: (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
    };
    expect(Object.keys(closedForms).toSorted()).toEqual([...EASE_NAMES].toSorted());
    for (const name of EASE_NAMES) {
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        expect(EASES[name](p), `${name}(${p})`).toBeCloseTo(closedForms[name]?.(p) ?? Number.NaN, 12);
      }
    }
  });

  it("lets outBack overshoot, for a small settle", () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => EASES.outBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
  });
});
