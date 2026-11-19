import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildScene } from "../engine/iso/scene.ts";
import { KIND_SIZES } from "../engine/iso/sizes.ts";
import { type Graph, NODE_KINDS } from "../schema/graph.ts";
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

type Rect = { x: number; y: number; w: number; d: number };
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

describe("layoutGraph properties", () => {
  it("never overlaps boxes or puts a node on another zone's platform", async () => {
    await fc.assert(
      fc.asyncProperty(graphs, async (graph) => {
        const result = await layoutGraph(graph, {});
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const boxes = graph.nodes.map((node) => {
          const p = result.value.positions[node.id];
          if (!p) throw new Error(`no position for ${node.id}`);
          return { node, rect: { ...p, w: KIND_SIZES[node.kind].w, d: KIND_SIZES[node.kind].d } };
        });
        for (const [i, a] of boxes.entries()) {
          for (const b of boxes.slice(i + 1)) {
            expect(overlap(a.rect, b.rect), `${a.node.id} overlaps ${b.node.id}`).toBe(false);
          }
        }
        const rects = new Map(boxes.map(({ node, rect }) => [node.id, rect]));
        for (const edge of graph.edges) {
          const route = result.value.routes[edge.id];
          if (!route) throw new Error(`no route for ${edge.id}`);
          for (const [i, b] of route.slice(1).entries()) {
            const a = route[i];
            expect(a?.x === b.x || a?.y === b.y, `${edge.id} has a diagonal segment`).toBe(true);
          }
          expect(onBoundary(route[0], rects.get(edge.from)), `${edge.id} start`).toBe(true);
          expect(onBoundary(route.at(-1), rects.get(edge.to)), `${edge.id} end`).toBe(true);
        }
        const scene = buildScene(graph, result.value.positions, {
          scale: 1,
          originX: 0,
          originY: 0,
        });
        if (!scene.ok) throw new Error(JSON.stringify(scene.errors));
        for (const zone of scene.value.zones) {
          for (const { node, rect } of boxes) {
            if (node.zone === zone.id) continue;
            expect(overlap(rect, zone.rect), `${node.id} on ${zone.id}`).toBe(false);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

const onBoundary = (
  point: { x: number; y: number } | undefined,
  box: Rect | undefined,
): boolean => {
  if (!point || !box) return false;
  const e = 1e-6;
  const within = (v: number, lo: number, hi: number) => v >= lo - e && v <= hi + e;
  const near = (v: number, target: number) => Math.abs(v - target) <= e;
  return (
    ((near(point.x, box.x) || near(point.x, box.x + box.w)) &&
      within(point.y, box.y, box.y + box.d)) ||
    ((near(point.y, box.y) || near(point.y, box.y + box.d)) &&
      within(point.x, box.x, box.x + box.w))
  );
};
