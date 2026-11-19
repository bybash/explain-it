import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScene } from "../engine/iso/scene.ts";
import { KIND_SIZES } from "../engine/iso/sizes.ts";
import { formatErrors } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import { layoutGraph } from "./layout.ts";

const example = ((): Graph => {
  const json = readFileSync(
    new URL("../../examples/oauth-login/graph.json", import.meta.url),
    "utf8",
  );
  const result = parseGraph(JSON.parse(json));
  if (!result.ok) throw new Error("example graph is invalid");
  return result.value;
})();

const laidOut = async (graph: Graph, overrides: Layout["overrides"] = {}): Promise<Layout> => {
  const result = await layoutGraph(graph, overrides);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

type Rect = { x: number; y: number; w: number; d: number };

const footprints = (graph: Graph, layout: Layout): Map<string, Rect> =>
  new Map(
    graph.nodes.map((node) => {
      const position = layout.positions[node.id];
      if (!position) throw new Error(`no position for ${node.id}`);
      const { w, d } = KIND_SIZES[node.kind];
      return [node.id, { ...position, w, d }];
    }),
  );

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

describe("layoutGraph", () => {
  it("places every node of the example on the half-unit grid, without overlaps", async () => {
    const layout = await laidOut(example);
    const boxes = [...footprints(example, layout).entries()];
    expect(boxes.map(([id]) => id).toSorted()).toEqual(example.nodes.map((n) => n.id).toSorted());
    for (const [, box] of boxes) {
      expect(Number.isInteger(box.x * 2) && Number.isInteger(box.y * 2)).toBe(true);
    }
    for (const [i, [a, boxA]] of boxes.entries()) {
      for (const [b, boxB] of boxes.slice(i + 1)) {
        expect(overlap(boxA, boxB), `${a} overlaps ${b}`).toBe(false);
      }
    }
  });

  it("lets overrides win over computed positions", async () => {
    const layout = await laidOut(example, { user: { x: 40, y: 40 } });
    expect(layout.positions.user).toEqual({ x: 40, y: 40 });
    expect(layout.overrides).toEqual({ user: { x: 40, y: 40 } });
    expect(layout.positions.app).toEqual((await laidOut(example)).positions.app);
  });

  it("drops the routes of edges touching an overridden node, and only those", async () => {
    const layout = await laidOut(example, { user: { x: 40, y: 40 } });
    const dropped = Object.entries(layout.routes)
      .filter(([, route]) => route === null)
      .map(([id]) => id);
    expect(dropped).toEqual(["click"]);
  });

  it("gives the same layout every time for the same graph", async () => {
    expect(await laidOut(example)).toEqual(await laidOut(example));
  });

  it("names overrides for nodes that do not exist", async () => {
    const result = await layoutGraph(example, { ghost: { x: 1, y: 1 } });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      'overrides.ghost: unknown node "ghost"',
    ]);
  });

  it("routes every edge with straight segments from the source box to the target box", async () => {
    const layout = await laidOut(example);
    const boxes = footprints(example, layout);
    for (const edge of example.edges) {
      const route = layout.routes[edge.id];
      if (!route) throw new Error(`no route for ${edge.id}`);
      expect(route.length).toBeGreaterThanOrEqual(2);
      for (const [a, b] of route.slice(1).map((p, i) => [route[i], p] as const)) {
        expect(a?.x === b.x || a?.y === b.y, `${edge.id} has a diagonal segment`).toBe(true);
      }
      expect(onBoundary(route[0], boxes.get(edge.from)), `${edge.id} start`).toBe(true);
      expect(onBoundary(route.at(-1), boxes.get(edge.to)), `${edge.id} end`).toBe(true);
    }
  });

  it("keeps every node outside a zone off that zone's platform", async () => {
    expect(zoneIntrusions(example, await laidOut(example))).toEqual([]);
  });
});

const VIEW = { scale: 40, originX: 0, originY: 0 };

/** Nodes standing on the platform of a zone they do not belong to, as "node in zone". */
const zoneIntrusions = (graph: Graph, layout: Layout): string[] => {
  const scene = buildScene(graph, layout.positions, VIEW);
  if (!scene.ok) throw new Error(JSON.stringify(scene.errors));
  const boxes = footprints(graph, layout);
  return scene.value.zones.flatMap((zone) =>
    graph.nodes
      .filter((node) => node.zone !== zone.id)
      .filter((node) => {
        const box = boxes.get(node.id);
        return box !== undefined && overlap(box, zone.rect);
      })
      .map((node) => `${node.id} in ${zone.id}`),
  );
};

const EPSILON = 1e-9;

const onBoundary = (
  point: { x: number; y: number } | undefined,
  box: Rect | undefined,
): boolean => {
  if (!point || !box) return false;
  const within = (v: number, lo: number, hi: number) => v >= lo - EPSILON && v <= hi + EPSILON;
  const near = (v: number, target: number) => Math.abs(v - target) <= EPSILON;
  const onVertical =
    (near(point.x, box.x) || near(point.x, box.x + box.w)) && within(point.y, box.y, box.y + box.d);
  const onHorizontal =
    (near(point.y, box.y) || near(point.y, box.y + box.d)) && within(point.x, box.x, box.x + box.w);
  return onVertical || onHorizontal;
};
