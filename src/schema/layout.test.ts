import { describe, expect, it } from "vitest";
import { formatErrors } from "./errors.ts";
import type { Graph } from "./graph.ts";
import { parseLayout } from "./layout.ts";

const graph: Graph = {
  version: 1,
  title: "Two boxes",
  nodes: [
    { id: "app", label: "App", kind: "service" },
    { id: "db", label: "Users", kind: "database" },
  ],
  edges: [{ id: "e1", from: "app", to: "db" }],
  zones: [],
};

const validLayout = () => ({
  version: 1,
  positions: { app: { x: 0, y: 0 }, db: { x: 5.5, y: 0 } },
  overrides: {},
  routes: {
    e1: [
      { x: 3, y: 1.5 },
      { x: 5.5, y: 1.5 },
    ],
  },
});

const errorsFor = (data: unknown) => {
  const result = parseLayout(data, graph);
  return result.ok ? [] : formatErrors(result.errors);
};

describe("parseLayout", () => {
  it("accepts a layout that matches the graph", () => {
    expect(errorsFor(validLayout())).toEqual([]);
  });

  it("accepts a dropped route", () => {
    expect(errorsFor({ ...validLayout(), routes: { e1: null } })).toEqual([]);
  });

  it("names missing and unknown positions, overrides and routes", () => {
    expect(
      errorsFor({
        version: 1,
        positions: { app: { x: 0, y: 0 }, ghost: { x: 1, y: 1 } },
        overrides: { phantom: { x: 2, y: 2 } },
        routes: { e9: null },
      }),
    ).toEqual([
      'positions.db: missing position for node "db"',
      'positions.ghost: unknown node "ghost"',
      'overrides.phantom: unknown node "phantom"',
      'routes.e1: missing route for edge "e1"',
      'routes.e9: unknown edge "e9"',
    ]);
  });

  it("names a stale file: a position that differs from its override, a route kept for it", () => {
    expect(
      errorsFor({
        ...validLayout(),
        overrides: { db: { x: 9, y: 9 } },
      }),
    ).toEqual([
      "positions.db: differs from its override, so the layout is stale",
      'routes.e1: must be null while "db" is overridden, so the layout is stale',
    ]);
  });

  it("requires routes of at least two points", () => {
    expect(errorsFor({ ...validLayout(), routes: { e1: [{ x: 0, y: 0 }] } })).toEqual([
      "routes.e1: 1 items, min 2",
    ]);
  });
});
