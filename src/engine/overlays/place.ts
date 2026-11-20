import type { ScreenPoint } from "../iso/project.ts";
import type { NodeShape, Polygon } from "../iso/scene.ts";
import type { Rect } from "./regions.ts";

/** Pixels between a callout card and the corner of the node it points at. */
export const CALLOUT_GAP = 28;

export type CalloutSide = "right" | "left" | "above" | "below";

export type CalloutPlacement = {
  readonly side: CalloutSide;
  /** The point on the node the card refers to. */
  readonly anchor: ScreenPoint;
  readonly box: Rect;
  /** Where the line to the anchor leaves the card: the card's point nearest the anchor. */
  readonly pointer: ScreenPoint;
};

type Size = { readonly width: number; readonly height: number };

/** Overlap below this many square pixels counts as none: shared edges and rounding. */
const TOUCHING = 1;

const SIDES: readonly CalloutSide[] = ["right", "left", "above", "below"];
/**
 * How far a card may slide along its side, as shares of its own length on
 * that axis: centred first, then further off-centre. The anchor stays within
 * the card's span, so the pointer still leaves from its facing edge.
 */
const SLIDES = [0, -0.25, 0.25, -0.5, 0.5] as const;

/**
 * Where a callout card of `size` goes next to a node: to the right if it fits
 * inside `bounds` without covering any of `obstacles` (screen polygons, such as
 * every node's faces), else the left, above or below; then each side again
 * with the card slid along it. When nothing is free, it takes the place that
 * covers least, moved inside `bounds`.
 */
export const placeCallout = (
  node: NodeShape["faces"],
  size: Size,
  bounds: Rect,
  obstacles: readonly Polygon[],
): CalloutPlacement => {
  const candidates = SLIDES.flatMap((slide) =>
    SIDES.map((side) => {
      const anchor = anchorOn(node, side);
      const wanted = slid(boxBeside(anchor, side, size), side, slide);
      const box = clampInto(wanted, bounds);
      const covered = obstacles.reduce((sum, polygon) => sum + overlapArea(polygon, box), 0);
      const free = covered < TOUCHING && box.x === wanted.x && box.y === wanted.y;
      return { side, anchor, box, covered, free };
    }),
  );
  const best =
    candidates.find((c) => c.free) ?? candidates.reduce((a, b) => (b.covered < a.covered ? b : a));
  return {
    side: best.side,
    anchor: best.anchor,
    box: best.box,
    pointer: nearestIn(best.box, best.anchor),
  };
};

/** Pixels between a badge and the top corner of its node. */
export const BADGE_LIFT = 10;

/** Where a node's badge sits: the back corner of its top face, the highest point of the box. */
export const badgeAnchor = (node: NodeShape["faces"]): ScreenPoint =>
  node.top.reduce((highest, p) => (p.y < highest.y ? p : highest));

/** A badge of `size` standing centred over its node's anchor, moved inside `bounds`. */
export const placeBadge = (node: NodeShape["faces"], size: Size, bounds: Rect): Rect => {
  const anchor = badgeAnchor(node);
  return clampInto(
    { x: anchor.x - size.width / 2, y: anchor.y - BADGE_LIFT - size.height, ...size },
    bounds,
  );
};

const allPoints = (node: NodeShape["faces"]): ScreenPoint[] => [
  ...node.top,
  ...node.left,
  ...node.right,
];

/** The node's outermost point towards `side`: a top-face corner, or the bottom of the box. */
const anchorOn = (node: NodeShape["faces"], side: CalloutSide): ScreenPoint => {
  const points = side === "below" ? allPoints(node) : node.top;
  const pick = {
    right: (a: ScreenPoint, b: ScreenPoint) => b.x > a.x,
    left: (a: ScreenPoint, b: ScreenPoint) => b.x < a.x,
    above: (a: ScreenPoint, b: ScreenPoint) => b.y < a.y,
    below: (a: ScreenPoint, b: ScreenPoint) => b.y > a.y,
  }[side];
  return points.reduce((best, p) => (pick(best, p) ? p : best));
};

const boxBeside = (anchor: ScreenPoint, side: CalloutSide, { width, height }: Size): Rect => {
  switch (side) {
    case "right":
      return { x: anchor.x + CALLOUT_GAP, y: anchor.y - height / 2, width, height };
    case "left":
      return { x: anchor.x - CALLOUT_GAP - width, y: anchor.y - height / 2, width, height };
    case "above":
      return { x: anchor.x - width / 2, y: anchor.y - CALLOUT_GAP - height, width, height };
    case "below":
      return { x: anchor.x - width / 2, y: anchor.y + CALLOUT_GAP, width, height };
  }
};

const slid = (box: Rect, side: CalloutSide, share: number): Rect =>
  side === "right" || side === "left"
    ? { ...box, y: box.y + share * box.height }
    : { ...box, x: box.x + share * box.width };

/** Moves `box` inside `bounds`; a box larger than the bounds keeps its top left inside. */
const clampInto = (box: Rect, bounds: Rect): Rect => {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  return {
    ...box,
    x: clamp(box.x, bounds.x, bounds.x + bounds.width - box.width),
    y: clamp(box.y, bounds.y, bounds.y + bounds.height - box.height),
  };
};

const nearestIn = (box: Rect, p: ScreenPoint): ScreenPoint => ({
  x: Math.min(Math.max(p.x, box.x), box.x + box.width),
  y: Math.min(Math.max(p.y, box.y), box.y + box.height),
});

/** The area of a convex polygon inside a rectangle: the polygon clipped to it (Sutherland–Hodgman). */
const overlapArea = (polygon: Polygon, rect: Rect): number => {
  const edges: readonly [(p: ScreenPoint) => number, "x" | "y", number][] = [
    [(p) => p.x - rect.x, "x", rect.x],
    [(p) => rect.x + rect.width - p.x, "x", rect.x + rect.width],
    [(p) => p.y - rect.y, "y", rect.y],
    [(p) => rect.y + rect.height - p.y, "y", rect.y + rect.height],
  ];
  let clipped: readonly ScreenPoint[] = polygon;
  for (const [inside, axis, at] of edges) {
    const next: ScreenPoint[] = [];
    for (const [i, a] of clipped.entries()) {
      const b = clipped[(i + 1) % clipped.length] ?? a;
      const [ia, ib] = [inside(a) >= 0, inside(b) >= 0];
      if (ia) next.push(a);
      if (ia !== ib) {
        const t = (at - a[axis]) / (b[axis] - a[axis]);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    clipped = next;
    if (clipped.length === 0) return 0;
  }
  const twice = clipped.reduce((sum, a, i) => {
    const b = clipped[(i + 1) % clipped.length] ?? a;
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  return Math.abs(twice) / 2;
};
