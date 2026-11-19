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
