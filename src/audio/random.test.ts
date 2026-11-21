import { describe, expect, it } from "vitest";
import { seededRandom } from "./random.ts";

const draw = (seed: number, count: number) => {
  const next = seededRandom(seed);
  return Array.from({ length: count }, next);
};

describe("seededRandom", () => {
  it("gives the same numbers for the same seed, every time", () => {
    expect(draw(7, 5)).toEqual(draw(7, 5));
    // Pinned, so a change to the generator shows up here before it changes every project's music.
    expect(draw(1, 3).map((n) => n.toFixed(6))).toEqual(["0.627074", "0.002736", "0.527447"]);
  });

  it("gives different numbers for different seeds", () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it("stays in [0, 1) and spreads evenly", () => {
    const numbers = draw(42, 10_000);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThan(1);
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});
