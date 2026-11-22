/** A point on the stage, in pixels. */
export type Point = { readonly x: number; readonly y: number };
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The smallest convex outline around the points (Andrew's monotone chain). */
export const convexHull = (points: readonly Point[]): Point[] => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const half = (list: readonly Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/** How far the points reach along an axis: the projection's least and greatest. */
const span = (points: readonly Point[], axis: Point) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const d = p.x * axis.x + p.y * axis.y;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
};

/** The unit normals of a convex polygon's edges. */
const normals = (polygon: readonly Point[]): Point[] =>
  polygon.flatMap((p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Point;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    return length === 0 ? [] : [{ x: -(q.y - p.y) / length, y: (q.x - p.x) / length }];
  });

/**
 * How far two convex shapes must move apart to stop overlapping, in pixels:
 * the least overlap along every edge's normal (separating axes). Zero when
 * they touch or stand apart.
 */
export const overlapDepth = (a: readonly Point[], b: readonly Point[]): number => {
  let depth = Number.POSITIVE_INFINITY;
  for (const axis of [...normals(a), ...normals(b)]) {
    const p = span(a, axis);
    const q = span(b, axis);
    const overlap = Math.min(p.max, q.max) - Math.max(p.min, q.min);
    if (overlap <= 0) return 0;
    depth = Math.min(depth, overlap);
  }
  return Number.isFinite(depth) ? depth : 0;
};

/**
 * How much of a line runs inside a convex shape, in pixels: each segment is
 * clipped to the shape (Cyrus–Beck) and the pieces inside are summed.
 */
export const insideLength = (line: readonly Point[], polygon: readonly Point[]): number => {
  // Orient the edges so `inward` points inside, whichever way the polygon winds.
  const area = polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Point;
    return sum + (p.x * q.y - q.x * p.y);
  }, 0);
  const sign = area >= 0 ? 1 : -1;
  let total = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Point;
    const b = line[i + 1] as Point;
    const d = { x: b.x - a.x, y: b.y - a.y };
    let enter = 0;
    let leave = 1;
    for (let k = 0; k < polygon.length && enter <= leave; k++) {
      const p = polygon[k] as Point;
      const q = polygon[(k + 1) % polygon.length] as Point;
      const inward = { x: -(q.y - p.y) * sign, y: (q.x - p.x) * sign };
      const denominator = inward.x * d.x + inward.y * d.y;
      const numerator = inward.x * (a.x - p.x) + inward.y * (a.y - p.y);
      if (denominator === 0) {
        if (numerator < 0) leave = -1;
        continue;
      }
      const t = -numerator / denominator;
      if (denominator > 0) enter = Math.max(enter, t);
      else leave = Math.min(leave, t);
    }
    if (leave > enter) total += (leave - enter) * Math.hypot(d.x, d.y);
  }
  return total;
};

/** How far a shape reaches past a frame, in pixels; zero when it stays inside. */
export const outsideBy = (polygon: readonly Point[], frame: Rect): number => {
  let worst = 0;
  for (const p of polygon)
    worst = Math.max(
      worst,
      frame.x - p.x,
      p.x - (frame.x + frame.width),
      frame.y - p.y,
      p.y - (frame.y + frame.height),
    );
  return worst;
};
