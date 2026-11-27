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

describe("project: another angle", () => {
  // Looking down from `elevation` degrees; isometric is about 35.26.
  const at = (elevation: number) => ({ ...view, elevation });

  it("draws the isometric angle exactly as the default view", () => {
    const point = { x: 3, y: -1, z: 2 };
    const iso = project(point, view);
    const named = project(point, at(Math.atan(Math.SQRT1_2) * (180 / Math.PI)));
    expect(named.x).toBeCloseTo(iso.x, 9);
    expect(named.y).toBeCloseTo(iso.y, 9);
  });

  it("keeps widths, and draws the floor and heights shallower from lower down, in isometric's ratio", () => {
    const low = at(25);
    const down = 10 * Math.cos(Math.PI / 6) * Math.sin((25 * Math.PI) / 180);
    expect(project({ x: 1, y: 0, z: 0 }, low).x).toBeCloseTo(108.660254, 5);
    expect(project({ x: 1, y: 0, z: 0 }, low).y).toBeCloseTo(50 + down, 9);
    // A unit up is twice a unit down the floor, as in isometric (10 and 5 px there).
    expect(project({ x: 0, y: 0, z: 1 }, low).y).toBeCloseTo(50 - 2 * down, 9);
    expect(project({ x: 1, y: 0, z: 0 }, low).y).toBeLessThan(
      project({ x: 1, y: 0, z: 0 }, view).y,
    );
  });
});
