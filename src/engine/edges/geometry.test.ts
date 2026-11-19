import { describe, expect, it } from "vitest";
import { project, type ScreenPoint, type View } from "../iso/project.ts";
import { edgeGeometry } from "./geometry.ts";

const view: View = { scale: 10, originX: 100, originY: 50 };
const floor = (x: number, y: number): ScreenPoint => project({ x, y, z: 0 }, view);
/** A floor rectangle as a screen polygon, standing in for a node drawn over the edge. */
const rect = (x: number, y: number, w: number, d: number) => [
  floor(x, y),
  floor(x + w, y),
  floor(x + w, y + d),
  floor(x, y + d),
];

const expectNear = (actual: ScreenPoint, expected: ScreenPoint) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

// An L: 4 units along x, then 2 along y.
const route = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
];

describe("edgeGeometry", () => {
  it("projects the route to the screen; a floor unit is `scale` pixels long on either axis", () => {
    const edge = edgeGeometry(route, view, []);
    for (const [i, p] of edge.points.entries()) {
      expectNear(p, floor(route[i]?.x ?? 0, route[i]?.y ?? 0));
    }
    expect(edge.length).toBeCloseTo(60, 6);
  });

  it("finds the point at a distance along the path, and the direction it travels there", () => {
    const edge = edgeGeometry(route, view, []);
    expectNear(edge.pointAt(0).at, floor(0, 0));
    expectNear(edge.pointAt(30).at, floor(3, 0));
    expectNear(edge.pointAt(50).at, floor(4, 1));
    expectNear(edge.pointAt(999).at, floor(4, 2));
    expectNear(edge.pointAt(50).direction, { x: -Math.cos(Math.PI / 6), y: 0.5 });
  });

  it("gives the drawn part of the path for a draw-in fraction", () => {
    const edge = edgeGeometry(route, view, []);
    expect(edge.drawn(0)).toEqual([floor(0, 0), floor(0, 0)]);
    const half = edge.drawn(0.5);
    expect(half).toHaveLength(2);
    expectNear(half[1] ?? floor(0, 0), floor(3, 0));
    const most = edge.drawn(5 / 6);
    expect(most).toHaveLength(3);
    expectNear(most[2] ?? floor(0, 0), floor(4, 1));
    expect(edge.drawn(1)).toEqual(edge.points);
  });

  it("anchors the label in the middle of the longest segment", () => {
    expectNear(edgeGeometry(route, view, []).label, floor(2, 0));
  });

  it("anchors the label in the longest stretch not hidden behind a node", () => {
    // Covers x 1 to 3.5 of the first segment: its visible stretches are 1 and 0.5 units long,
    // so the 2-unit second segment wins.
    expectNear(edgeGeometry(route, view, [rect(1, -1, 2.5, 2)]).label, floor(4, 1));
    // Covering most of the second segment instead leaves the first one whole.
    expectNear(edgeGeometry(route, view, [rect(3, 0.5, 2, 3)]).label, floor(2, 0));
  });

  it("anchors the label in the middle of the visible stretch of a partly hidden segment", () => {
    // Hides x 0 to 1.5 of a 6-unit straight route: the label sits between 1.5 and 6.
    const straight = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ];
    expectNear(edgeGeometry(straight, view, [rect(-1, -1, 2.5, 2)]).label, floor(3.75, 0));
  });
});
