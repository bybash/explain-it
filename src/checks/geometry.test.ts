import { describe, expect, it } from "vitest";
import { convexHull, insideLength, outsideBy, overlapDepth } from "./geometry.ts";

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** A diamond, as a node's top face is drawn. */
const diamond = (cx: number, cy: number, r: number) => [
  { x: cx, y: cy - r / 2 },
  { x: cx + r, y: cy },
  { x: cx, y: cy + r / 2 },
  { x: cx - r, y: cy },
];

describe("overlapDepth", () => {
  it("is how far two shapes must move apart to stop overlapping", () => {
    expect(overlapDepth(rect(0, 0, 100, 50), rect(90, 10, 100, 50))).toBeCloseTo(10);
    expect(overlapDepth(rect(0, 0, 100, 50), rect(20, 40, 50, 50))).toBeCloseTo(10);
  });

  it("is zero for shapes that only touch or stand apart", () => {
    expect(overlapDepth(rect(0, 0, 100, 50), rect(100, 0, 50, 50))).toBe(0);
    expect(overlapDepth(rect(0, 0, 100, 50), rect(200, 0, 50, 50))).toBe(0);
  });

  it("sees the gap between diamonds whose boxes overlap", () => {
    // Bounding boxes overlap, the diamonds do not: the separating axis is a slanted edge.
    expect(overlapDepth(diamond(0, 0, 100), diamond(110, 60, 100))).toBe(0);
    expect(overlapDepth(diamond(0, 0, 100), diamond(60, 0, 100))).toBeGreaterThan(4);
  });
});

describe("insideLength", () => {
  it("measures how much of a line runs through a shape", () => {
    expect(
      insideLength(
        [
          { x: -50, y: 25 },
          { x: 150, y: 25 },
        ],
        rect(0, 0, 100, 50),
      ),
    ).toBeCloseTo(100);
    expect(
      insideLength(
        [
          { x: -50, y: 25 },
          { x: 50, y: 25 },
          { x: 50, y: 200 },
        ],
        rect(0, 0, 100, 50),
      ),
    ).toBeCloseTo(50 + 25);
  });

  it("is zero for a line that passes by", () => {
    expect(
      insideLength(
        [
          { x: -50, y: 80 },
          { x: 150, y: 80 },
        ],
        rect(0, 0, 100, 50),
      ),
    ).toBe(0);
  });
});

describe("convexHull", () => {
  it("wraps a box's faces in one outline", () => {
    const hull = convexHull([...rect(0, 0, 10, 10), { x: 5, y: 5 }, ...rect(5, 5, 10, 10)]);
    expect(hull).toHaveLength(6);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });
});

describe("outsideBy", () => {
  it("is how far a shape reaches past a frame, or zero inside it", () => {
    const frame = { x: 96, y: 54, width: 1728, height: 972 };
    expect(outsideBy(rect(100, 100, 200, 100), frame)).toBe(0);
    expect(outsideBy(rect(80, 100, 200, 100), frame)).toBe(16);
    expect(outsideBy(rect(1700, 1000, 200, 100), frame)).toBe(1900 - 1824);
  });
});
