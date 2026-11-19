import { referenceErrors } from "../../schema/common.ts";
import type { Validated, ValidationError } from "../../schema/errors.ts";
import type { Graph, NodeKind } from "../../schema/graph.ts";
import { fail, ok } from "../../schema/result.ts";
import { project, type ScreenPoint, type View } from "./project.ts";
import { KIND_SIZES, ZONE_MARGIN } from "./sizes.ts";

/** Projects a grid point (x, y, height) to the screen, with the view already applied. */
type Projector = (x: number, y: number, z: number) => ScreenPoint;

/** Where each node's footprint starts, in grid units. Layout produces these. */
export type Positions = Readonly<Record<string, { readonly x: number; readonly y: number }>>;

/** A box in grid units: footprint x, y, w (along x), d (along y), and height h. */
export type Box = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
};

export type Polygon = readonly ScreenPoint[];

export type NodeShape = {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly box: Box;
  /** Faces in screen space. Left faces +y (towards the viewer, left), right faces +x. */
  readonly faces: { readonly top: Polygon; readonly left: Polygon; readonly right: Polygon };
  /**
   * For drawing icons and labels flat on the top face: content laid out in a
   * `width` × `depth` pixel area, placed with the SVG `matrix(...transform)`.
   */
  readonly topContent: {
    readonly width: number;
    readonly depth: number;
    readonly transform: readonly [number, number, number, number, number, number];
  };
};

/** A flat platform under the nodes of one zone. */
export type ZoneShape = {
  readonly id: string;
  readonly label: string;
  /** The platform in grid units, at floor level. */
  readonly rect: Omit<Box, "h">;
  readonly polygon: Polygon;
};

/** One dot of the floor grid. */
export type FloorDot = {
  readonly grid: { readonly x: number; readonly y: number };
  readonly at: ScreenPoint;
  /** On a whole grid unit: drawn larger. */
  readonly major: boolean;
  /** 0..1, strongest in the middle of the floor. */
  readonly opacity: number;
};

/** Everything to draw, in screen space: floor, then zones, then nodes in drawing order. */
export type Scene = {
  readonly floor: readonly FloorDot[];
  readonly zones: readonly ZoneShape[];
  readonly nodes: readonly NodeShape[];
};

/** How far the floor reaches beyond the outermost node or zone, in grid units. */
const FLOOR_MARGIN = 2;

export const buildScene = (graph: Graph, positions: Positions, view: View): Validated<Scene> => {
  const errors = positionErrors(graph, positions);
  if (errors.length > 0) return fail(errors);

  const at: Projector = (x, y, z) => project({ x, y, z }, view);
  const nodes = graph.nodes.flatMap((node): NodeShape[] => {
    const position = positions[node.id];
    if (!position) return [];
    const box: Box = { x: position.x, y: position.y, ...KIND_SIZES[node.kind] };
    return [
      {
        id: node.id,
        kind: node.kind,
        label: node.label,
        box,
        faces: facesOf(box, at),
        topContent: topContentOf(box, at, view.scale),
      },
    ];
  });
  const zones = zonesOf(graph, nodes, at);
  return ok({
    floor: floorOf([...nodes.map((n) => n.box), ...zones.map((z) => z.rect)], at),
    zones,
    nodes: depthSorted(nodes),
  });
};

const floorOf = (footprints: readonly Omit<Box, "h">[], at: Projector): FloorDot[] => {
  if (footprints.length === 0) return [];
  const minX = Math.floor(Math.min(...footprints.map((f) => f.x)) - FLOOR_MARGIN);
  const minY = Math.floor(Math.min(...footprints.map((f) => f.y)) - FLOOR_MARGIN);
  const maxX = Math.ceil(Math.max(...footprints.map((f) => f.x + f.w)) + FLOOR_MARGIN);
  const maxY = Math.ceil(Math.max(...footprints.map((f) => f.y + f.d)) + FLOOR_MARGIN);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const reach = Math.hypot(maxX - centreX, maxY - centreY);

  const dots: FloorDot[] = [];
  for (let i = minX * 2; i <= maxX * 2; i++) {
    for (let j = minY * 2; j <= maxY * 2; j++) {
      const x = i / 2;
      const y = j / 2;
      const distance = Math.hypot(x - centreX, y - centreY) / reach;
      dots.push({
        grid: { x, y },
        at: at(x, y, 0),
        major: i % 2 === 0 && j % 2 === 0,
        opacity: Math.max(0, 1 - distance ** 2),
      });
    }
  }
  return dots;
};

const zonesOf = (graph: Graph, nodes: readonly NodeShape[], at: Projector): ZoneShape[] =>
  // The platform is the bounding rectangle of the zone's members, so it can
  // reach under a non-member placed between them. Layout (slice 1.4) must keep
  // non-members out of a zone's rectangle.
  graph.zones.flatMap((zone): ZoneShape[] => {
    const memberIds = new Set(graph.nodes.filter((n) => n.zone === zone.id).map((n) => n.id));
    const boxes = nodes.filter((n) => memberIds.has(n.id)).map((n) => n.box);
    if (boxes.length === 0) return [];
    const x = Math.min(...boxes.map((b) => b.x)) - ZONE_MARGIN;
    const y = Math.min(...boxes.map((b) => b.y)) - ZONE_MARGIN;
    const w = Math.max(...boxes.map((b) => b.x + b.w)) + ZONE_MARGIN - x;
    const d = Math.max(...boxes.map((b) => b.y + b.d)) + ZONE_MARGIN - y;
    return [
      {
        id: zone.id,
        label: zone.label,
        rect: { x, y, w, d },
        polygon: [at(x, y, 0), at(x + w, y, 0), at(x + w, y + d, 0), at(x, y + d, 0)],
      },
    ];
  });

const positionErrors = (graph: Graph, positions: Positions): ValidationError[] => {
  const { errors, add } = referenceErrors();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    if (!(node.id in positions))
      add(["positions", node.id], `missing position for node "${node.id}"`);
  }
  for (const id of Object.keys(positions)) {
    if (!nodeIds.has(id)) add(["positions", id], `unknown node "${id}"`);
  }
  return errors;
};

/**
 * `a` must be drawn before `b` when it is behind `b`: entirely at smaller x
 * while their y ranges overlap, or entirely at smaller y while their x ranges
 * overlap. Boxes separated along both axes in opposite directions never
 * overlap on screen, so they need no order.
 */
const isBehind = (a: Box, b: Box): boolean =>
  (a.x + a.w <= b.x && a.y < b.y + b.d) || (a.y + a.d <= b.y && a.x < b.x + b.w);

const nearness = (box: Box): number => box.x + box.w / 2 + box.y + box.d / 2;

/**
 * Painter's order: a topological sort over `isBehind`. Among boxes free to
 * go next, the one furthest back goes first, then graph order. `isBehind`
 * cannot form a cycle for footprints that do not overlap; overlapping ones (a
 * layout bug) are simply left unordered, and the fallback below is defensive.
 */
const depthSorted = (nodes: readonly NodeShape[]): NodeShape[] => {
  const remaining = [...nodes];
  const sorted: NodeShape[] = [];
  while (remaining.length > 0) {
    const free = remaining.filter(
      (candidate) =>
        !remaining.some((other) => other !== candidate && isBehind(other.box, candidate.box)),
    );
    const pool = free.length > 0 ? free : remaining;
    const next = pool.reduce((best, n) => (nearness(n.box) < nearness(best.box) ? n : best));
    sorted.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return sorted;
};

/** Maps one pixel along the top face's x and y edges to its screen direction. */
const topContentOf = (
  { x, y, w, d, h }: Box,
  at: Projector,
  scale: number,
): NodeShape["topContent"] => {
  const origin = at(x, y, h);
  const alongX = at(x + 1, y, h);
  const alongY = at(x, y + 1, h);
  return {
    width: w * scale,
    depth: d * scale,
    transform: [
      (alongX.x - origin.x) / scale,
      (alongX.y - origin.y) / scale,
      (alongY.x - origin.x) / scale,
      (alongY.y - origin.y) / scale,
      origin.x,
      origin.y,
    ],
  };
};

const facesOf = ({ x, y, w, d, h }: Box, at: Projector): NodeShape["faces"] => ({
  top: [at(x, y, h), at(x + w, y, h), at(x + w, y + d, h), at(x, y + d, h)],
  left: [at(x, y + d, h), at(x + w, y + d, h), at(x + w, y + d, 0), at(x, y + d, 0)],
  right: [at(x + w, y, h), at(x + w, y + d, h), at(x + w, y + d, 0), at(x + w, y, 0)],
});
