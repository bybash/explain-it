import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Graph, NODE_KINDS } from "../schema/graph.ts";
import { layoutProblems } from "./layout.testing.ts";
import { layoutGraph } from "./layout.ts";

/** Valid graphs: up to 12 nodes, random edges, some nodes in up to 3 zones. */
const graphs: fc.Arbitrary<Graph> = fc
  .integer({ min: 1, max: 12 })
  .chain((count) =>
    fc.record({
      kinds: fc.array(fc.constantFrom(...NODE_KINDS), { minLength: count, maxLength: count }),
      zoneOf: fc.array(fc.integer({ min: -1, max: 2 }), { minLength: count, maxLength: count }),
      edges: fc.array(fc.tuple(fc.nat(count - 1), fc.nat(count - 1)), { maxLength: 16 }),
    }),
  )
  .map(({ kinds, zoneOf, edges }) => {
    const usedZones = [...new Set(zoneOf.filter((z) => z >= 0))];
    return {
      version: 1 as const,
      title: "Random",
      nodes: kinds.map((kind, i) => {
        const zone = zoneOf[i] ?? -1;
        return zone >= 0
          ? { id: `n${i}`, label: `N${i}`, kind, zone: `z${zone}` }
          : { id: `n${i}`, label: `N${i}`, kind };
      }),
      edges: edges.map(([from, to], i) => ({ id: `e${i}`, from: `n${from}`, to: `n${to}` })),
      zones: usedZones.map((z) => ({ id: `z${z}`, label: `Zone ${z}` })),
    };
  });

/** A graph fast-check found: a run moved into sight landed on its neighbour, leaving a point twice. */
const runMeetsNeighbour: Graph = {
  version: 1,
  title: "Random",
  nodes: [
    { id: "n0", label: "N0", kind: "actor", zone: "z1" },
    { id: "n1", label: "N1", kind: "actor", zone: "z0" },
    { id: "n2", label: "N2", kind: "external", zone: "z0" },
    { id: "n3", label: "N3", kind: "decision", zone: "z0" },
    { id: "n4", label: "N4", kind: "database", zone: "z2" },
    { id: "n5", label: "N5", kind: "actor", zone: "z2" },
    { id: "n6", label: "N6", kind: "actor", zone: "z2" },
    { id: "n7", label: "N7", kind: "decision", zone: "z0" },
    { id: "n8", label: "N8", kind: "actor", zone: "z2" },
    { id: "n9", label: "N9", kind: "actor", zone: "z0" },
  ],
  edges: [
    { id: "e0", from: "n5", to: "n6" },
    { id: "e1", from: "n0", to: "n6" },
    { id: "e2", from: "n0", to: "n6" },
    { id: "e3", from: "n1", to: "n4" },
  ],
  zones: [
    { id: "z1", label: "Zone 1" },
    { id: "z0", label: "Zone 0" },
    { id: "z2", label: "Zone 2" },
  ],
};

/** Another: a run moved into sight stopped a fraction of a grid step from the last run. */
const runNearNeighbour: Graph = {
  version: 1,
  title: "Random",
  nodes: [
    { id: "n0", label: "N0", kind: "service" },
    { id: "n1", label: "N1", kind: "database", zone: "z1" },
    { id: "n2", label: "N2", kind: "queue" },
    { id: "n3", label: "N3", kind: "database", zone: "z1" },
  ],
  edges: [
    { id: "e0", from: "n1", to: "n0" },
    { id: "e1", from: "n3", to: "n0" },
    { id: "e2", from: "n1", to: "n0" },
    { id: "e3", from: "n3", to: "n0" },
    { id: "e4", from: "n3", to: "n1" },
    { id: "e5", from: "n1", to: "n3" },
    { id: "e6", from: "n3", to: "n3" },
  ],
  zones: [{ id: "z1", label: "Zone 1" }],
};

describe("layoutGraph", () => {
  it("leaves no step shorter than the grid when it moves a run into sight", async () => {
    const result = await layoutGraph(runNearNeighbour, {});
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(layoutProblems(runNearNeighbour, result.value)).toEqual([]);
  });

  it("leaves no repeated point or straight bend when it moves a run into sight", async () => {
    const result = await layoutGraph(runMeetsNeighbour, {});
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(layoutProblems(runMeetsNeighbour, result.value)).toEqual([]);
  });
});

describe("layoutGraph properties", () => {
  it("never produces a layout problem", async () => {
    await fc.assert(
      fc.asyncProperty(graphs, async (graph) => {
        const result = await layoutGraph(graph, {});
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(layoutProblems(graph, result.value)).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});
