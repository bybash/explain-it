import type { ScreenPoint, View } from "./project.ts";

/** The most pixels per grid unit a scene is framed at, so a scene of two nodes is not blown up. */
export const MAX_SCALE = 90;

type Region = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The view that frames `points` (projected with scale 1 and origin 0) in
 * `region`: as large as fits, up to `MAX_SCALE`, and centred.
 */
export const fitView = (points: readonly ScreenPoint[], region: Region): View => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    MAX_SCALE,
    region.width / Math.max(maxX - minX, Number.EPSILON),
    region.height / Math.max(maxY - minY, Number.EPSILON),
  );
  return {
    scale,
    originX: region.x + region.width / 2 - ((minX + maxX) / 2) * scale,
    originY: region.y + region.height / 2 - ((minY + maxY) / 2) * scale,
  };
};
