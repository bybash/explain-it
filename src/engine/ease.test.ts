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

  it("lets outBack overshoot, for a small settle", () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => EASES.outBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
  });
});
