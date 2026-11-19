import { describe, expect, it } from "vitest";
import type { Graph } from "../../schema/graph.ts";
import { edgeRoutes, fallbackRoute } from "./fallback.ts";

const box = (x: number, y: number, w = 2, d = 2) => ({ x, y, w, d });

describe("fallbackRoute", () => {
  it("runs straight along x between boxes side by side, in the middle of their shared depth", () => {
    expect(fallbackRoute(box(0, 0), box(5, 1))).toEqual([
      { x: 2, y: 1.5 },
      { x: 5, y: 1.5 },
    ]);
    expect(fallbackRoute(box(5, 1), box(0, 0))).toEqual([
      { x: 5, y: 1.5 },
      { x: 2, y: 1.5 },
    ]);
  });

  it("runs straight along y between boxes one behind the other", () => {
    expect(fallbackRoute(box(0, 0), box(1, 5))).toEqual([
      { x: 1.5, y: 2 },
      { x: 1.5, y: 5 },
    ]);
  });

  it("bends once between boxes apart on both axes: out along x, then into the target along y", () => {
    expect(fallbackRoute(box(0, 0), box(5, 5))).toEqual([
      { x: 2, y: 1 },
      { x: 6, y: 1 },
      { x: 6, y: 5 },
    ]);
    expect(fallbackRoute(box(5, 5), box(0, 0))).toEqual([
      { x: 5, y: 6 },
      { x: 1, y: 6 },
      { x: 1, y: 2 },
    ]);
  });

  it("bends rather than graze a corner when boxes share less than half a unit", () => {
    expect(fallbackRoute(box(0, 0), box(5, 1.8, 2, 3))).toEqual([
      { x: 2, y: 1 },
      { x: 6, y: 1 },
      { x: 6, y: 1.8 },
    ]);
  });

  it("joins the centres with one bend when the boxes overlap, which the checks report", () => {
    expect(fallbackRoute(box(0, 0, 4, 4), box(2, 2, 4, 4))).toEqual([
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
    ]);
  });
});

describe("edgeRoutes", () => {
  const graph: Graph = {
    version: 1,
    title: "Two hops",
    nodes: [
      { id: "a", label: "A", kind: "service" },
      { id: "b", label: "B", kind: "service" },
      { id: "c", label: "C", kind: "service" },
    ],
    edges: [
      { id: "ab", from: "a", to: "b" },
      { id: "bc", from: "b", to: "c" },
    ],
    zones: [],
  };

  it("keeps the layout's routes and fills the dropped ones with a fallback route", () => {
    const routed = [
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ];
    const routes = edgeRoutes(graph, {
      version: 1,
      positions: { a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, c: { x: 5, y: 10 } },
      overrides: { c: { x: 5, y: 10 } },
      routes: { ab: routed, bc: null },
    });
    // Services are 3 × 2.6, so b and c share x 5 to 8 and face each other at y 2.6 and 10.
    expect(routes).toEqual({
      ab: routed,
      bc: [
        { x: 6.5, y: 2.6 },
        { x: 6.5, y: 10 },
      ],
    });
  });
});
