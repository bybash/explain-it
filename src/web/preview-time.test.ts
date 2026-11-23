import { describe, expect, it } from "vitest";
import { beatAt, clockTime } from "./preview-time.ts";

const beats = [
  { id: "a", scene: "s1", start: 2, end: 5 },
  { id: "b", scene: "s1", start: 5, end: 9 },
  { id: "c", scene: "s2", start: 10, end: 14 },
];

describe("beatAt", () => {
  it("is the beat playing at a time, or none on a card or between scenes", () => {
    expect(beatAt(beats, 0)).toBeUndefined();
    expect(beatAt(beats, 2)?.id).toBe("a");
    expect(beatAt(beats, 5)?.id).toBe("b");
    expect(beatAt(beats, 9.5)).toBeUndefined();
    expect(beatAt(beats, 13.9)?.id).toBe("c");
    expect(beatAt(beats, 14)).toBeUndefined();
  });
});

describe("clockTime", () => {
  it("shows minutes and seconds", () => {
    expect(clockTime(0)).toBe("0:00");
    expect(clockTime(9.9)).toBe("0:09");
    expect(clockTime(80.2)).toBe("1:20");
  });
});
