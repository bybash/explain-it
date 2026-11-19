import type { Footprint } from "../engine/iso/sizes.ts";
import type { FloorPoint as Point } from "../schema/layout.ts";

/**
 * How far a route end stays from the corners of its box when a jog is
 * straightened by sliding the end along the box's side.
 */
const END_INSET = 0.25;

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/**
 * Drops repeated points and points in the middle of a straight run. ELK splits
 * an edge between zones into sections whose joints repeat a point, and
 * snapping can line up a jog; neither should reach the drawing as a bend.
 */
const withoutRedundantPoints = (route: readonly Point[]): Point[] => {
  const kept: Point[] = [];
  for (const point of route) {
    const last = kept.at(-1);
    if (last && last.x === point.x && last.y === point.y) continue;
    const beforeLast = kept.at(-2);
    if (
      last &&
      beforeLast &&
      ((beforeLast.x === last.x && last.x === point.x) ||
        (beforeLast.y === last.y && last.y === point.y))
    )
      kept.pop();
    kept.push(point);
  }
  return kept;
};

/**
 * Straightens jogs: interior segments shorter than `minimum`, left between two
 * parallel runs when snapping moved the boxes at either end by different
 * amounts. One of the runs moves across to line up with the other. A run that
 * ends on a box may move only while its end stays on that box's side; a run
 * whose far neighbour would turn back on itself does not move. A jog that
 * neither run can absorb is kept.
 */
export const withoutJogs = (
  route: readonly Point[],
  from: Footprint,
  to: Footprint,
  minimum: number,
): Point[] => {
  let points = withoutRedundantPoints(route);
  for (;;) {
    const straightened = straightenOne(points, from, to, minimum);
    if (!straightened) return points;
    points = withoutRedundantPoints(straightened);
  }
};

const straightenOne = (
  points: readonly Point[],
  from: Footprint,
  to: Footprint,
  minimum: number,
): Point[] | undefined => {
  const last = points.length - 1;
  // Segment i runs from point i to point i + 1; interior ones have a run on each side.
  for (let i = 1; i + 1 < last; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length === 0 || length >= minimum) continue;
    // A vertical jog (constant x) separates two horizontal runs, which differ in y.
    const key = near(a.x, b.x) ? "y" : "x";
    const after = { moved: [i + 1, i + 2], to: a[key], beyond: i + 3 } as const;
    const before = { moved: [i, i - 1], to: b[key], beyond: i - 2 } as const;
    // Prefer the run that does not end on a box, so ends stay where ELK put them.
    const candidates = i + 2 === last && i - 1 !== 0 ? [before, after] : [after, before];
    for (const { moved, to: value, beyond } of candidates) {
      const next = points.map((p, index) => (moved.includes(index) ? { ...p, [key]: value } : p));
      const outer = moved[1];
      const allowed =
        outer === 0
          ? staysOnSide(value, key, from)
          : outer === last
            ? staysOnSide(value, key, to)
            : keepsDirection(points, next, outer, beyond, key);
      if (allowed) return next;
    }
  }
  return undefined;
};

const staysOnSide = (value: number, key: "x" | "y", box: Footprint): boolean => {
  const start = box[key];
  const size = key === "x" ? box.w : box.d;
  return value >= start + END_INSET && value <= start + size - END_INSET;
};

/** The segment from the moved bend to the next point keeps its direction, or shrinks to nothing. */
const keepsDirection = (
  before: readonly Point[],
  after: readonly Point[],
  moved: number,
  beyond: number,
  key: "x" | "y",
): boolean => {
  const far = before[beyond];
  const old = before[moved];
  const now = after[moved];
  if (!far || !old || !now) return false;
  const was = Math.sign(far[key] - old[key]);
  const is = Math.sign(far[key] - now[key]);
  return is === 0 || is === was;
};
