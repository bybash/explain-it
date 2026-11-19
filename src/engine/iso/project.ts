/** A point in grid units: x and y on the floor, z up. */
export type GridPoint = { readonly x: number; readonly y: number; readonly z: number };

/** A point in screen pixels. */
export type ScreenPoint = { readonly x: number; readonly y: number };

/** How grid units map to the screen: pixels per unit and where the grid origin sits. */
export type View = { readonly scale: number; readonly originX: number; readonly originY: number };

const COS_30 = Math.cos(Math.PI / 6);

/** Isometric projection: +x goes down-right and +y down-left at 30 degrees, +z straight up. */
export const project = (point: GridPoint, view: View): ScreenPoint => ({
  x: view.originX + (point.x - point.y) * view.scale * COS_30,
  y: view.originY + (point.x + point.y) * view.scale * 0.5 - point.z * view.scale,
});
