import { insideLength, overlapDepth } from "../../checks/geometry.ts";
import type { FloorPoint } from "../../schema/layout.ts";
import { project, type ScreenPoint, type View } from "../iso/project.ts";
import type { Polygon } from "../iso/scene.ts";

/** Where something travelling along the edge is, and its unit direction of travel. */
export type Travel = { readonly at: ScreenPoint; readonly direction: ScreenPoint };

export type EdgeGeometry = {
  /** The route projected onto the screen, from source to target. */
  readonly points: readonly ScreenPoint[];
  /** In pixels. */
  readonly length: number;
  /** The point `distance` pixels along the path, clamped to its ends. */
  pointAt(distance: number): Travel;
  /** The path up to a draw-in fraction (0..1); always at least two points. */
  drawn(fraction: number): ScreenPoint[];
  /** Where the label goes: the middle of the longest stretch no node hides. */
  readonly label: ScreenPoint;
};

/** Pixels between an edge's end and its target box's outline, when the box would hide the end. */
export const ARROW_GAP = 6;
/** An edge cut back shorter than this would have no room for its arrowhead, so it is left whole. */
const MIN_CUT_LENGTH = 32;
/** Less of an end inside the outline than this is rounding, not a box hiding it. */
const HIDDEN_TOLERANCE = 0.5;

/**
 * The screen geometry of one edge drawn on the floor. `occluders` are the
 * screen polygons of everything drawn over the edges (node faces), so the
 * label never lands behind a box. They must be convex. `target` is the
 * target box's outline on screen: an edge that arrives from behind the box
 * ends inside it, where the box would hide its arrowhead, so it is cut back
 * to just outside the outline.
 */
export const edgeGeometry = (
  route: readonly FloorPoint[],
  view: View,
  occluders: readonly Polygon[],
  target?: Polygon,
): EdgeGeometry => {
  const floor = route.map((p) => project({ x: p.x, y: p.y, z: 0 }, view));
  const hidden = target ? hiddenEnd(floor, target) : 0;
  const keep = lengthOf(floor) - hidden - ARROW_GAP;
  const points = hidden > HIDDEN_TOLERANCE && keep >= MIN_CUT_LENGTH ? cutTo(floor, keep) : floor;
  const starts: number[] = [];
  let length = 0;
  for (const [i, a] of points.entries()) {
    starts.push(length);
    const b = points[i + 1];
    if (b) length += distance(a, b);
  }
  const first = points[0] ?? { x: 0, y: 0 };

  /** The segment that holds `d`, as its index and its two ends. */
  const segmentAt = (d: number) => {
    for (let i = points.length - 2; i >= 0; i--) {
      const a = points[i];
      const b = points[i + 1];
      const start = starts[i] ?? 0;
      if (a && b && (d >= start || i === 0)) return { i, a, b, start };
    }
    return undefined;
  };

  const pointAt = (d: number): Travel => {
    const clamped = Math.min(Math.max(d, 0), length);
    const segment = segmentAt(clamped);
    if (!segment) return { at: first, direction: { x: 0, y: 0 } };
    const { a, b, start } = segment;
    const span = distance(a, b);
    const t = span === 0 ? 0 : (clamped - start) / span;
    return {
      at: lerp(a, b, t),
      direction: span === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / span, y: (b.y - a.y) / span },
    };
  };

  const drawn = (fraction: number): ScreenPoint[] => {
    if (fraction >= 1) return [...points];
    const d = Math.max(0, fraction) * length;
    const segment = segmentAt(d);
    if (!segment) return [first, first];
    return [...points.slice(0, segment.i + 1), pointAt(d).at];
  };

  return { points, length, pointAt, drawn, label: labelAnchor(points, occluders) };
};

const distance = (a: ScreenPoint, b: ScreenPoint): number => Math.hypot(b.x - a.x, b.y - a.y);

const lengthOf = (points: readonly ScreenPoint[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[i + 1];
    return q ? sum + distance(p, q) : sum;
  }, 0);

/** Whether a point lies inside a convex polygon, whichever way it winds. */
const insideConvex = (p: ScreenPoint, polygon: Polygon): boolean => {
  let sign = 0;
  for (const [i, a] of polygon.entries()) {
    const b = polygon[(i + 1) % polygon.length] ?? a;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
};

/**
 * How much of the path's end lies inside a convex outline: walking back from
 * the end while it is inside, so a stretch that passes the outline earlier
 * is not counted.
 */
const hiddenEnd = (points: readonly ScreenPoint[], outline: Polygon): number => {
  let hidden = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || !insideConvex(b, outline)) break;
    const inside = insideLength([a, b], outline);
    hidden += inside;
    // The segment leaves the outline on its way back: the end's stretch is over.
    if (inside < distance(a, b) - 1e-9) break;
  }
  return hidden;
};

/** The path up to `keep` pixels from its start; at least its first point twice. */
const cutTo = (points: readonly ScreenPoint[], keep: number): ScreenPoint[] => {
  const kept: ScreenPoint[] = [];
  let left = Math.max(0, keep);
  for (const [i, a] of points.entries()) {
    kept.push(a);
    const b = points[i + 1];
    if (!b) break;
    const span = distance(a, b);
    if (span >= left) {
      kept.push(lerp(a, b, span === 0 ? 0 : left / span));
      break;
    }
    left -= span;
  }
  return kept.length > 1 ? kept : [kept[0] ?? { x: 0, y: 0 }, kept[0] ?? { x: 0, y: 0 }];
};

const lerp = (a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

type Interval = { readonly start: number; readonly end: number };

/**
 * The part of segment a→b strictly inside a convex polygon, as fractions of
 * the segment (Cyrus–Beck clipping). Touching the outline does not hide.
 */
const hiddenBy = (a: ScreenPoint, b: ScreenPoint, polygon: Polygon): Interval | undefined => {
  let area = 0;
  for (const [i, p] of polygon.entries()) {
    const q = polygon[(i + 1) % polygon.length] ?? p;
    area += cross(p.x, p.y, q.x, q.y);
  }
  if (area === 0) return undefined;
  const side = Math.sign(area);
  let start = 0;
  let end = 1;
  for (const [i, p] of polygon.entries()) {
    const q = polygon[(i + 1) % polygon.length] ?? p;
    // Inside this edge's half-plane where c0 + t * c1 > 0.
    const c0 = side * cross(q.x - p.x, q.y - p.y, a.x - p.x, a.y - p.y);
    const c1 = side * cross(q.x - p.x, q.y - p.y, b.x - a.x, b.y - a.y);
    if (c1 === 0) {
      if (c0 <= 0) return undefined;
      continue;
    }
    const t = -c0 / c1;
    if (c1 > 0) start = Math.max(start, t);
    else end = Math.min(end, t);
  }
  return start < end ? { start, end } : undefined;
};

/** The longest stretch of [0, 1] outside every hidden interval. */
const longestVisible = (hidden: readonly Interval[]): Interval => {
  let best: Interval = { start: 0, end: 0 };
  let cursor = 0;
  for (const h of hidden.toSorted((x, y) => x.start - y.start)) {
    if (h.start - cursor > best.end - best.start) best = { start: cursor, end: h.start };
    cursor = Math.max(cursor, h.end);
  }
  if (1 - cursor > best.end - best.start) best = { start: cursor, end: 1 };
  return best;
};

const labelAnchor = (
  points: readonly ScreenPoint[],
  occluders: readonly Polygon[],
): ScreenPoint => {
  let anchor = points[0] ?? { x: 0, y: 0 };
  let longest = -1;
  for (const [i, a] of points.entries()) {
    const b = points[i + 1];
    if (!b) break;
    const hidden = occluders.flatMap((polygon) => hiddenBy(a, b, polygon) ?? []);
    const visible = longestVisible(hidden);
    const pixels = (visible.end - visible.start) * distance(a, b);
    if (pixels > longest + 1e-9) {
      longest = pixels;
      anchor = lerp(a, b, (visible.start + visible.end) / 2);
    }
  }
  return anchor;
};

/** How far apart candidate spots along a line are, in pixels. */
const LABEL_STEP = 6;
/** Room kept around a label, from boxes and other labels. */
const LABEL_CLEARANCE = 6;

/**
 * Where an upright label of `size` goes on its line: the spot that covers
 * the least of `avoid` (boxes and labels already placed, convex), then the
 * one nearest the line, then the one nearest `preferred`. Spots run along
 * the line, and a label's height above or below it, so a short line between
 * two boxes can still carry its label beside it.
 */
export const placeLabel = (
  points: readonly ScreenPoint[],
  size: { readonly width: number; readonly height: number },
  avoid: readonly (readonly ScreenPoint[])[],
  preferred: ScreenPoint,
): ScreenPoint => {
  const half = { x: size.width / 2 + LABEL_CLEARANCE, y: size.height / 2 + LABEL_CLEARANCE };
  const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4].map((k) => k * (size.height + LABEL_CLEARANCE));
  // The preferred spot is on the line (the middle of its longest stretch in sight), so it is a candidate too.
  const along: ScreenPoint[] = [preferred];
  for (const [i, a] of points.entries()) {
    const b = points[i + 1];
    if (!b) break;
    const steps = Math.max(1, Math.ceil(distance(a, b) / LABEL_STEP));
    for (let s = 0; s <= steps; s++) along.push(lerp(a, b, s / steps));
  }
  let best = { at: preferred, covered: Number.POSITIVE_INFINITY, offset: 0, away: 0 };
  for (const offset of offsets)
    for (const point of along) {
      const at = { x: point.x, y: point.y + offset };
      const box = [
        { x: at.x - half.x, y: at.y - half.y },
        { x: at.x + half.x, y: at.y - half.y },
        { x: at.x + half.x, y: at.y + half.y },
        { x: at.x - half.x, y: at.y + half.y },
      ];
      const covered = avoid.reduce((sum, polygon) => sum + overlapDepth(box, polygon), 0);
      const away = distance(at, preferred);
      const better =
        covered < best.covered - 1e-9 ||
        (Math.abs(covered - best.covered) <= 1e-9 &&
          (Math.abs(offset) < Math.abs(best.offset) ||
            (Math.abs(offset) === Math.abs(best.offset) && away < best.away)));
      if (better) best = { at, covered, offset, away };
    }
  return best.at;
};
