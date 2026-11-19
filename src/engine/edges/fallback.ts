import type { Graph } from "../../schema/graph.ts";
import type { FloorPoint, Layout } from "../../schema/layout.ts";
import { type Footprint, footprintOf } from "../iso/sizes.ts";

/** How much of a side two boxes must share for a straight route, so it never grazes a corner. */
const MIN_SHARED = 0.5;

type Span = { readonly start: number; readonly end: number };

const spanX = (b: Footprint): Span => ({ start: b.x, end: b.x + b.w });
const spanY = (b: Footprint): Span => ({ start: b.y, end: b.y + b.d });
const centre = (s: Span): number => (s.start + s.end) / 2;
const shared = (a: Span, b: Span): Span => ({
  start: Math.max(a.start, b.start),
  end: Math.min(a.end, b.end),
});
/** Strictly apart: boxes that touch have no room for a route between them. */
const apart = (a: Span, b: Span): boolean => a.end < b.start || b.end < a.start;
/** The side of `a` that faces `b`, and the side of `b` that faces `a`, along one axis. */
const facing = (a: Span, b: Span): [number, number] =>
  a.end <= b.start ? [a.end, b.start] : [a.start, b.end];

/**
 * A simple orthogonal route for an edge the layout could not route, because
 * one of its ends was moved by hand: straight between boxes that share enough
 * of a side, otherwise out of the source along x and into the target along y.
 */
export const fallbackRoute = (from: Footprint, to: Footprint): FloorPoint[] => {
  const [fx, fy, tx, ty] = [spanX(from), spanY(from), spanX(to), spanY(to)];
  const sharedY = shared(fy, ty);
  const sharedX = shared(fx, tx);

  if (apart(fx, tx) && sharedY.end - sharedY.start >= MIN_SHARED) {
    const [x1, x2] = facing(fx, tx);
    const y = centre(sharedY);
    return [
      { x: x1, y },
      { x: x2, y },
    ];
  }
  if (apart(fy, ty) && sharedX.end - sharedX.start >= MIN_SHARED) {
    const [y1, y2] = facing(fy, ty);
    const x = centre(sharedX);
    return [
      { x, y: y1 },
      { x, y: y2 },
    ];
  }

  const y = centre(fy);
  const x = centre(tx);
  const outsideSource = x < fx.start || x > fx.end;
  const outsideTarget = y < ty.start || y > ty.end;
  if (outsideSource && outsideTarget) {
    const exitX = x > fx.end ? fx.end : fx.start;
    const entryY = y < ty.start ? ty.start : ty.end;
    return [
      { x: exitX, y },
      { x, y },
      { x, y: entryY },
    ];
  }
  // Touching or overlapping boxes (an override placed one on another): join the centres.
  const start = { x: centre(fx), y };
  const end = { x, y: centre(ty) };
  return end.y === y ? [start, end] : [start, { x, y }, end];
};

/**
 * A route for every edge: the layout's where it has one, otherwise the
 * fallback. The layout must have been validated against the graph.
 */
export const edgeRoutes = (graph: Graph, layout: Layout): Record<string, FloorPoint[]> => {
  const footprint = (id: string): Footprint => {
    const node = graph.nodes.find((n) => n.id === id);
    const position = layout.positions[id];
    if (!node || !position) throw new Error(`no position for node "${id}"`);
    return footprintOf(node.kind, position);
  };
  return Object.fromEntries(
    graph.edges.map((edge) => [
      edge.id,
      layout.routes[edge.id] ?? fallbackRoute(footprint(edge.from), footprint(edge.to)),
    ]),
  );
};
