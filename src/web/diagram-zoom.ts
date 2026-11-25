/** A width and height, in pixels. */
export type Size = { readonly width: number; readonly height: number };

/** How far a diagram can be zoomed out and in, and how much one press changes it. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const STEP = 1.25;

const within = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * The zoom that shows the whole drawing in its box: smaller for a drawing
 * that does not fit, larger for a small one up to `largest`.
 */
export const fitZoom = (drawing: Size, box: Size, largest: number): number =>
  drawing.width <= 0 || drawing.height <= 0 || box.width <= 0 || box.height <= 0
    ? 1
    : within(Math.min(largest, box.width / drawing.width, box.height / drawing.height));

/** One press of zoom in (`1`) or out (`-1`). */
export const zoomStep = (zoom: number, by: 1 | -1): number =>
  within(by === 1 ? zoom * STEP : zoom / STEP);
