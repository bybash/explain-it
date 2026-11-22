import { convexHull, insideLength } from "../checks/geometry.ts";
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
 * amounts. One of the runs moves across to line up with the other; when both
 * end on boxes and neither can move alone, both slide to a line their boxes
 * share. A run does not move when:
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
    // Both runs end on boxes and neither can move alone: try a straight line
    // where both boxes' sides allow one, as near the jog as possible.
    if (i === 1 && last === 3) {
      const [fromLow, fromHigh] = sideRange(key, from);
      const [toLow, toHigh] = sideRange(key, to);
      const low = Math.max(fromLow, toLow);
      const high = Math.min(fromHigh, toHigh);
      if (low <= high) {
        const value = Math.min(Math.max((a[key] + b[key]) / 2, low), high);
        const next = points.map((p) => ({ ...p, [key]: value }));
        if (!crossesABox(next, [0, 1, 2, 3], boxes)) return next;
      }
    }
  }
  return undefined;
};

/** Where a route end may sit along one side of a box: the side minus its corners. */
const sideRange = (key: "x" | "y", box: Footprint): [number, number] => {
  const start = box[key];
  const size = key === "x" ? box.w : box.d;
  return [start + END_INSET, start + size - END_INSET];
};

const staysOnSide = (value: number, key: "x" | "y", box: Footprint): boolean => {
  const [low, high] = sideRange(key, box);
  return value >= low && value <= high;
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

/** A box on the floor, with its height: what it can hide behind it. */
export type Standing = Footprint & { readonly h: number };

/** Room kept beyond what a box hides, and around a box, when a run moves. */
const SIGHT_MARGIN = 0.3;
/** A run hidden for less than this, in grid units, is left alone. */
const HIDDEN_TOLERANCE = 0.05;

/**
 * The floor a box hides: moving back t along x and y and up t lands on the
 * same screen point, so the box hides its footprint swept back diagonally by
 * its height (decision 016).
 */
const hiddenFloor = ({ x, y, w, d, h }: Standing): Point[] =>
  convexHull(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + d },
      { x, y: y + d },
    ].flatMap((p) => [p, { x: p.x - h, y: p.y - h }]),
  );

const hiddenLength = (run: readonly Point[], boxes: readonly Standing[]): number =>
  boxes.reduce((sum, box) => sum + insideLength(run, hiddenFloor(box)), 0);

/** Whether a run crosses a box, or comes within half the margin of it (moves leave the whole margin). */
const CLEARANCE = SIGHT_MARGIN / 2;
const crossesBox = (run: readonly Point[], boxes: readonly Standing[]): boolean =>
  boxes.some(
    (b) =>
      insideLength(run, [
        { x: b.x - CLEARANCE, y: b.y - CLEARANCE },
        { x: b.x + b.w + CLEARANCE, y: b.y - CLEARANCE },
        { x: b.x + b.w + CLEARANCE, y: b.y + b.d + CLEARANCE },
        { x: b.x - CLEARANCE, y: b.y + b.d + CLEARANCE },
      ]) > HIDDEN_TOLERANCE,
  );

/**
 * Moves the runs of a route that pass out of sight behind a box: each goes
 * back past the floor the box hides, or in front of the box, whichever is
 * nearer and keeps it in sight and off every box. Its neighbours stretch
 * to follow, so the route stays horizontal and vertical. The first and
 * last runs end on their boxes and stay. The most hidden run moves first,
 * which often brings its neighbours into sight with it.
 */
export const inSight = (route: readonly Point[], boxes: readonly Standing[]): Point[] => {
  let points = [...route];
  for (let pass = 0; pass < points.length; pass++) {
    let worst = { index: -1, hidden: HIDDEN_TOLERANCE, box: undefined as Standing | undefined };
    for (let i = 1; i + 2 < points.length; i++) {
      const run = [points[i] as Point, points[i + 1] as Point];
      for (const box of boxes) {
        const hidden = insideLength(run, hiddenFloor(box));
        if (hidden > worst.hidden) worst = { index: i, hidden, box };
      }
    }
    const { index, box } = worst;
    if (!box) break;
    const a = points[index] as Point;
    const b = points[index + 1] as Point;
    const axis = a.y === b.y ? "y" : "x";
    const size = axis === "y" ? box.d : box.w;
    const options = [box[axis] - box.h - SIGHT_MARGIN, box[axis] + size + SIGHT_MARGIN]
      .map((at) => ({
        at,
        run: [
          { ...a, [axis]: at },
          { ...b, [axis]: at },
        ],
      }))
      .filter((o) => hiddenLength(o.run, boxes) <= HIDDEN_TOLERANCE && !crossesBox(o.run, boxes))
      .sort((p, q) => Math.abs(p.at - a[axis]) - Math.abs(q.at - a[axis]));
    const chosen = options[0];
    if (!chosen) break;
    points = points.map((p, i) =>
      i === index || i === index + 1 ? { ...p, [axis]: round(chosen.at) } : p,
    );
  }
  return points;
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;
