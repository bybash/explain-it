import elkBundled from "elkjs/lib/elk.bundled.js";
import type { ELKConstructorArguments, ELK as ElkInstance, ElkNode } from "elkjs/lib/elk-api.js";
import { type Footprint, footprintOf, KIND_SIZES, ZONE_MARGIN } from "../engine/iso/sizes.ts";
import { referenceErrors } from "../schema/common.ts";
import type { Validated } from "../schema/errors.ts";
import type { Graph, GraphNode } from "../schema/graph.ts";
import type { Layout, FloorPoint as Point } from "../schema/layout.ts";
import { fail, ok } from "../schema/result.ts";
import { inSight, withoutJogs } from "./routes.ts";

/**
 * ELK's default spacings assume pixel-sized numbers, so grid units go in
 * multiplied by this and come back divided by it.
 */
const ELK_SCALE = 10;
/** Positions are snapped to multiples of this, in grid units. */
export const GRID = 0.5;

/**
 * Space inside a zone around its members: the platform's margin, plus room
 * for snapping, which can move a box and a platform edge a quarter unit each.
 */
const ZONE_PADDING = ZONE_MARGIN + GRID;

const elkPadding = (units: number): string => {
  const p = units * ELK_SCALE;
  return `[top=${p},left=${p},bottom=${p},right=${p}]`;
};

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": String(1.5 * ELK_SCALE),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(2.5 * ELK_SCALE),
  "elk.padding": elkPadding(0),
};

/**
 * elkjs is CommonJS but declares an ESM default export. At runtime (Node and
 * Vite) the default import is the constructor; TypeScript expects it under
 * `.default`. Accept either.
 */
type ElkConstructor = new (args?: ELKConstructorArguments) => ElkInstance;
const ELK: ElkConstructor =
  (elkBundled as unknown as { default?: ElkConstructor }).default ??
  (elkBundled as unknown as ElkConstructor);

const snap = (value: number): number => Math.round(value / GRID) * GRID;

/** Lays a graph out on the floor: ELK x becomes grid x and ELK y becomes grid y. */
export const layoutGraph = async (
  graph: Graph,
  overrides: Layout["overrides"],
): Promise<Validated<Layout>> => {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const { errors, add } = referenceErrors();
  for (const id of Object.keys(overrides)) {
    if (!nodeIds.has(id)) add(["overrides", id], `unknown node "${id}"`);
  }
  if (errors.length > 0) return fail(errors);

  const box = (node: GraphNode): ElkNode => ({
    id: node.id,
    width: KIND_SIZES[node.kind].w * ELK_SCALE,
    height: KIND_SIZES[node.kind].d * ELK_SCALE,
  });
  const zones: ElkNode[] = graph.zones
    .map((zone) => ({
      id: zone.id,
      layoutOptions: { "elk.padding": elkPadding(ZONE_PADDING) },
      children: graph.nodes.filter((node) => node.zone === zone.id).map(box),
    }))
    .filter((zone) => zone.children.length > 0);
  const root: ElkNode = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: [...graph.nodes.filter((node) => node.zone === undefined).map(box), ...zones],
    edges: graph.edges.map((edge) => ({ id: edge.id, sources: [edge.from], targets: [edge.to] })),
  };
  const result = await new ELK().layout(root);

  // ELK positions children relative to their parent; collect absolute origins
  // of every ELK node (for edge containers) and snapped node positions.
  const origins = new Map<string, Point>();
  const positions: Record<string, Point> = {};
  const snapOffsets = new Map<string, Point>();
  const visit = (node: ElkNode, offsetX: number, offsetY: number): void => {
    const x = offsetX + (node.x ?? 0);
    const y = offsetY + (node.y ?? 0);
    origins.set(node.id, { x, y });
    if (nodeIds.has(node.id)) {
      const exact = { x: x / ELK_SCALE, y: y / ELK_SCALE };
      const snapped = { x: snap(exact.x), y: snap(exact.y) };
      positions[node.id] = snapped;
      snapOffsets.set(node.id, { x: snapped.x - exact.x, y: snapped.y - exact.y });
    }
    for (const child of node.children ?? []) visit(child, x, y);
  };
  visit(result, 0, 0);

  const footprint = (id: string): Footprint => {
    const node = graph.nodes.find((n) => n.id === id);
    const position = positions[id];
    if (!node || !position) throw new Error(`no position for node "${id}"`);
    return footprintOf(node.kind, position);
  };

  const routes: Record<string, Point[] | null> = {};
  for (const edge of result.edges ?? []) {
    const graphEdge = graph.edges.find((e) => e.id === edge.id);
    if (!graphEdge) continue;
    if (graphEdge.from in overrides || graphEdge.to in overrides) {
      routes[edge.id] = null;
      continue;
    }
    const origin = origins.get(edge.container ?? "root") ?? { x: 0, y: 0 };
    const points = (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    const exact = points.map((p) => ({
      x: (origin.x + p.x) / ELK_SCALE,
      y: (origin.y + p.y) / ELK_SCALE,
    }));
    routes[edge.id] = followSnapping(
      exact,
      snapOffsets.get(graphEdge.from) ?? { x: 0, y: 0 },
      snapOffsets.get(graphEdge.to) ?? { x: 0, y: 0 },
    ).map(roundOffNoise);
    routes[edge.id] = inSight(
      withoutJogs(
        routes[edge.id] ?? [],
        footprint(graphEdge.from),
        footprint(graphEdge.to),
        GRID,
        graph.nodes.map((node) => footprint(node.id)),
      ),
      graph.nodes.map((node) => ({ ...footprint(node.id), h: KIND_SIZES[node.kind].h })),
      GRID,
    );
  }

  const snappedOverrides = Object.fromEntries(
    Object.entries(overrides).map(([id, p]) => [id, { x: snap(p.x), y: snap(p.y) }]),
  );
  return ok({
    version: 1,
    positions: { ...positions, ...snappedOverrides },
    overrides: snappedOverrides,
    routes,
  });
};

/** Rounds to 1e-6 to clear floating-point noise, so points on one segment share coordinates exactly. */
const roundOffNoise = (p: Point): Point => ({
  x: Math.round(p.x * 1e6) / 1e6,
  y: Math.round(p.y * 1e6) / 1e6,
});

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

const shifted = (p: Point, by: Point): Point => ({ x: p.x + by.x, y: p.y + by.y });

/**
 * Moves a route's ends along with their boxes after snapping, keeping every
 * segment horizontal or vertical.
 *
 * `first`/`last` are the ends as ELK placed them; `start`/`end` are where they
 * are after snapping. A segment's direction is read from the ELK route, before
 * anything moved.
 */
const followSnapping = (route: readonly Point[], fromOffset: Point, toOffset: Point): Point[] => {
  const first = route[0];
  const last = route.at(-1);
  if (!first || !last || route.length < 2) return [...route];
  const start = shifted(first, fromOffset);
  const end = shifted(last, toOffset);

  // A straight route that no longer lines up gets a jog in its middle.
  if (route.length === 2) {
    if (near(start.x, end.x) || near(start.y, end.y)) return [start, end];
    if (near(first.y, last.y)) {
      const midX = (start.x + end.x) / 2;
      return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    }
    const midY = (start.y + end.y) / 2;
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }

  // Otherwise the bend next to each end slides with it, along the axis that
  // keeps the end's segment straight.
  const second = route[1];
  const beforeLast = route.at(-2);
  if (!second || !beforeLast) return [...route];
  const firstIsHorizontal = near(first.y, second.y);
  const lastIsHorizontal = near(beforeLast.y, last.y);
  const points = [...route];
  const n = points.length;
  points[0] = start;
  points[1] = firstIsHorizontal ? { x: second.x, y: start.y } : { x: start.x, y: second.y };
  points[n - 1] = end;
  // With three points, the bend at n - 2 is the one just moved at index 1: it
  // keeps that move along one axis and takes this one along the other.
  const bend = points[n - 2] ?? beforeLast;
  points[n - 2] = lastIsHorizontal ? { x: bend.x, y: end.y } : { x: end.x, y: bend.y };
  return points;
};
