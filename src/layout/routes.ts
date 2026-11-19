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
 * amounts. One of the runs moves across to line up with the other. A run
 * does not move when:
 * - it ends on a box and its end would leave that box's side;
 * - its far neighbour would turn back on itself;
 * - the stub into a box would get shorter than `minimum`;
 * - it, or a neighbour it stretches, would cross a box (`from`, `to` or one
 *   of `obstacles`).
 * A jog that neither run can absorb is kept.
 */
export const withoutJogs = (
  route: readonly Point[],
  from: Footprint,
  to: Footprint,
  minimum: number,
  obstacles: readonly Footprint[] = [],
): Point[] => {
  const boxes = [from, to, ...obstacles];
  let points = withoutRedundantPoints(route);
  for (;;) {
    const straightened = straightenOne(points, from, to, minimum, boxes);
    if (!straightened) return points;
    points = withoutRedundantPoints(straightened);
  }
};

const straightenOne = (
  points: readonly Point[],
  from: Footprint,
  to: Footprint,
  minimum: number,
  boxes: readonly Footprint[],
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
            : keepsDirection(points, next, outer, beyond, key) &&
              ((beyond !== 0 && beyond !== last) ||
                keepsStub(points, next, outer, beyond, minimum));
      if (allowed && !crossesABox(next, moved, boxes)) return next;
    }
  }
  return undefined;
};

const staysOnSide = (value: number, key: "x" | "y", box: Footprint): boolean => {
  const start = box[key];
  const size = key === "x" ? box.w : box.d;
  return value >= start + END_INSET && value <= start + size - END_INSET;
};

const lengthOf = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * The stub between a moved bend and a route end stays at least `minimum`
 * long, or no shorter than it was, and never disappears.
 */
const keepsStub = (
  before: readonly Point[],
  after: readonly Point[],
  moved: number,
  end: number,
  minimum: number,
): boolean => {
  const tip = before[end];
  const old = before[moved];
  const now = after[moved];
  if (!tip || !old || !now) return false;
  const length = lengthOf(now, tip);
  return length > 0 && (length >= minimum || length >= lengthOf(old, tip));
};

/** Whether an axis-aligned segment passes through a box's inside; touching its outline does not count. */
const crosses = (a: Point, b: Point, box: Footprint): boolean => {
  const inside = (v: number, start: number, size: number) =>
    v > start + 1e-6 && v < start + size - 1e-6;
  const overlaps = (p: number, q: number, start: number, size: number) =>
    Math.max(p, q) > start + 1e-6 && Math.min(p, q) < start + size - 1e-6;
  return near(a.y, b.y)
    ? inside(a.y, box.y, box.d) && overlaps(a.x, b.x, box.x, box.w)
    : inside(a.x, box.x, box.w) && overlaps(a.y, b.y, box.y, box.d);
};

/** Whether a segment touching one of the moved points now crosses a box. */
const crossesABox = (
  points: readonly Point[],
  moved: readonly number[],
  boxes: readonly Footprint[],
): boolean =>
  moved.some((m) =>
    [m - 1, m].some((i) => {
      const a = points[i];
      const b = points[i + 1];
      return a !== undefined && b !== undefined && boxes.some((box) => crosses(a, b, box));
    }),
  );

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
