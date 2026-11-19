// Test support: what is wrong with a layout, in words. Used by the layout
// tests only; dependency-cruiser keeps production code from importing it.
import { buildScene } from "../engine/iso/scene.ts";
import { KIND_SIZES } from "../engine/iso/sizes.ts";
import type { Graph } from "../schema/graph.ts";
import type { FloorPoint, Layout } from "../schema/layout.ts";
import { GRID } from "./layout.ts";

type Rect = { x: number; y: number; w: number; d: number };

/** Layout coordinates are rounded to 1e-6, so this is as close as two of them need to be. */
const TOLERANCE = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE;

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

const onBoundary = (point: FloorPoint | undefined, box: Rect | undefined): boolean => {
  if (!point || !box) return false;
  const within = (v: number, lo: number, hi: number) => v >= lo - TOLERANCE && v <= hi + TOLERANCE;
  const onSide =
    (near(point.x, box.x) || near(point.x, box.x + box.w)) && within(point.y, box.y, box.y + box.d);
  const onEnd =
    (near(point.y, box.y) || near(point.y, box.y + box.d)) && within(point.x, box.x, box.x + box.w);
  return onSide || onEnd;
};

/** Each node's footprint at its laid-out position. */
export const footprints = (graph: Graph, layout: Layout): Map<string, Rect> =>
  new Map(
    graph.nodes.map((node) => {
      const position = layout.positions[node.id];
      if (!position) throw new Error(`no position for ${node.id}`);
      const { w, d } = KIND_SIZES[node.kind];
      return [node.id, { ...position, w, d }];
    }),
  );

/**
 * Everything wrong with a layout, one line each: overlapping boxes, nodes on
 * another zone's platform, and routes that are diagonal, have redundant
 * bends or near-zero jogs, or do not start and end on their boxes.
 */
export const layoutProblems = (graph: Graph, layout: Layout): string[] => {
  const problems: string[] = [];
  const boxes = footprints(graph, layout);
  const entries = [...boxes.entries()];
  for (const [i, [a, boxA]] of entries.entries()) {
    for (const [b, boxB] of entries.slice(i + 1)) {
      if (overlap(boxA, boxB)) problems.push(`${a} overlaps ${b}`);
    }
  }

  const scene = buildScene(graph, layout.positions, { scale: 1, originX: 0, originY: 0 });
  if (!scene.ok) throw new Error(JSON.stringify(scene.errors));
  for (const zone of scene.value.zones) {
    for (const node of graph.nodes) {
      const box = boxes.get(node.id);
      if (node.zone !== zone.id && box && overlap(box, zone.rect))
        problems.push(`${node.id} is on ${zone.id}'s platform`);
    }
  }

  for (const edge of graph.edges) {
    const route = layout.routes[edge.id];
    if (route === undefined) problems.push(`${edge.id} has no route`);
    if (!route) continue;
    route.slice(1).forEach((b, i) => {
      const a = route[i];
      if (a && !(a.x === b.x || a.y === b.y)) problems.push(`${edge.id} segment ${i} is diagonal`);
    });
    route.slice(2).forEach((c, i) => {
      const a = route[i];
      const b = route[i + 1];
      if (a && b && ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)))
        problems.push(`${edge.id} has a redundant bend at point ${i + 1}`);
    });
    route.slice(1, -2).forEach((a, i) => {
      const b = route[i + 2];
      if (b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < GRID)
        problems.push(`${edge.id} has a jog at segment ${i + 1}`);
    });
    if (!onBoundary(route[0], boxes.get(edge.from))) problems.push(`${edge.id} starts off its box`);
    if (!onBoundary(route.at(-1), boxes.get(edge.to))) problems.push(`${edge.id} ends off its box`);
  }
  return problems;
};
