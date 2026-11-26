import { describe, expect, it } from "vitest";
import { fitView, MAX_SCALE, withCamera } from "./frame.ts";
import { project, type ScreenPoint, type View } from "./project.ts";

const content = { x: 100, y: 200, width: 1600, height: 600 };
const unit: View = { scale: 1, originX: 0, originY: 0 };

/** Where unit-view points land under `view`; projection is linear, so this is exact. */
const under = (view: View, p: ScreenPoint): ScreenPoint => ({
  x: view.originX + p.x * view.scale,
  y: view.originY + p.y * view.scale,
});

describe("fitView", () => {
  it("fills the content region along the tighter axis and centres the points", () => {
    // 20 by 5 in unit pixels: the width is the tighter fit, at 80 pixels a unit.
    const points = [
      { x: -10, y: 0 },
      { x: 10, y: 5 },
    ];
    const view = fitView(points, content);
    expect(view.scale).toBeCloseTo(80);
    const [a, b] = points.map((p) => under(view, p));
    expect(a).toEqual({ x: expect.closeTo(100), y: expect.closeTo(300) });
    expect(b).toEqual({ x: expect.closeTo(1700), y: expect.closeTo(700) });
  });

  it("frames projected boxes, which then lie inside the content region", () => {
    const corners = [
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 0, z: 1 },
      { x: 0, y: 9, z: 0 },
      { x: 6, y: 9, z: 1 },
    ];
    const view = fitView(
      corners.map((c) => project(c, unit)),
      content,
    );
    for (const c of corners) {
      const p = project(c, view);
      expect(p.x).toBeGreaterThanOrEqual(content.x - 1e-6);
      expect(p.x).toBeLessThanOrEqual(content.x + content.width + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(content.y - 1e-6);
      expect(p.y).toBeLessThanOrEqual(content.y + content.height + 1e-6);
    }
  });

  it("does not blow a small scene up past the largest scale, and still centres it", () => {
    const view = fitView(
      [
        { x: 0, y: 0 },
        { x: 2, y: 1 },
      ],
      content,
    );
    expect(view.scale).toBe(MAX_SCALE);
    expect(under(view, { x: 1, y: 0.5 })).toEqual({
      x: expect.closeTo(900),
      y: expect.closeTo(500),
    });
  });
});

describe("withCamera", () => {
  const points = [
    { x: -10, y: 0 },
    { x: 10, y: 5 },
  ];
  const fitted = fitView(points, content);

  it("zooms about the middle of the content region, and moves by a share of it", () => {
    const view = withCamera(fitted, content, { zoom: 1.5, x: 0.1, y: -0.2 });
    expect(view.scale).toBeCloseTo(120);
    // The points' middle sat in the region's middle (900, 500); it moves right 160 and up 120.
    expect(under(view, { x: 0, y: 2.5 })).toEqual({
      x: expect.closeTo(1060),
      y: expect.closeTo(380),
    });
  });

  it("leaves the view as it is without a camera, or with the one that changes nothing", () => {
    expect(withCamera(fitted, content, undefined)).toEqual(fitted);
    expect(withCamera(fitted, content, { zoom: 1, x: 0, y: 0 })).toEqual(fitted);
  });
});
