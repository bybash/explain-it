/** A point in grid units: x and y on the floor, z up. */
export type GridPoint = { readonly x: number; readonly y: number; readonly z: number };

/** A point in screen pixels. */
export type ScreenPoint = { readonly x: number; readonly y: number };

/**
 * How grid units map to the screen: pixels per unit, where the grid origin
 * sits, and, for another angle than isometric, how many degrees above the
 * floor the view looks down from (decision 047).
 */
export type View = {
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  readonly elevation?: number | undefined;
};

const COS_30 = Math.cos(Math.PI / 6);
/** In isometric, a unit up is drawn twice as long as a unit down the floor. */
const HEIGHT_TO_FLOOR = 2;

/**
 * The projection, turned 45° about the vertical: +x goes down-right and +y
 * down-left, +z straight up. Isometric by default (+x and +y at 30 degrees).
 * From an `elevation`, the floor goes down by its sine, with widths kept, so
 * a lower view is flatter and fills a wide frame; heights keep isometric's
 * ratio to the floor, so a box never hides more of it (decision 047).
 */
export const project = (point: GridPoint, view: View): ScreenPoint => {
  const across = (point.x - point.y) * view.scale * COS_30;
  if (view.elevation === undefined)
    return {
      x: view.originX + across,
      y: view.originY + (point.x + point.y) * view.scale * 0.5 - point.z * view.scale,
    };
  const down = view.scale * COS_30 * Math.sin((view.elevation * Math.PI) / 180);
  return {
    x: view.originX + across,
    y: view.originY + (point.x + point.y) * down - point.z * down * HEIGHT_TO_FLOOR,
  };
};
