import { describe, expect, it } from "vitest";
import { FPS, frameTimes, posterTime } from "./frames.ts";

describe("frameTimes", () => {
  it("captures 30 frames a second", () => {
    expect(FPS).toBe(30);
    expect(frameTimes(2)).toHaveLength(60);
  });

  it("starts at 0, steps one frame at a time and covers the whole duration", () => {
    const times = frameTimes(0.1);
    expect(times).toEqual([0, 1 / 30, 2 / 30]);
    expect(frameTimes(56.4)).toHaveLength(1692);
    expect(frameTimes(1.01)).toHaveLength(31);
  });

  it("never seeks past the end", () => {
    for (const d of [0.05, 1, 1.01, 7.333]) {
      const times = frameTimes(d);
      expect(Math.max(...times)).toBeLessThanOrEqual(d);
    }
  });

  it("captures one frame of a timeline with no length", () => {
    expect(frameTimes(0)).toEqual([0]);
  });
});

describe("posterTime", () => {
  it("is the middle of the first scene's last beat, when that scene is all drawn", () => {
    const plan = {
      scenes: [
        { id: "a", start: 0, end: 10 },
        { id: "b", start: 11, end: 20 },
      ],
      beats: [
        { id: "one", scene: "a", start: 0, end: 4 },
        { id: "two", scene: "a", start: 4, end: 10 },
        { id: "three", scene: "b", start: 11, end: 20 },
      ],
    };
    expect(posterTime(plan)).toBe(7);
  });
});
