import { describe, expect, it } from "vitest";
import { project } from "./project.ts";

const view = { scale: 10, originX: 100, originY: 50 };

describe("project", () => {
  it("puts the grid origin at the view origin", () => {
    expect(project({ x: 0, y: 0, z: 0 }, view)).toEqual({ x: 100, y: 50 });
  });

  it("sends +x down and to the right, +y down and to the left, at 30 degrees", () => {
    const alongX = project({ x: 1, y: 0, z: 0 }, view);
    const alongY = project({ x: 0, y: 1, z: 0 }, view);
    expect(alongX.x).toBeCloseTo(108.660254, 5);
    expect(alongX.y).toBeCloseTo(55, 10);
    expect(alongY.x).toBeCloseTo(91.339746, 5);
    expect(alongY.y).toBeCloseTo(55, 10);
  });

  it("raises points straight up by their height", () => {
    expect(project({ x: 0, y: 0, z: 2 }, view)).toEqual({ x: 100, y: 30 });
  });
});
