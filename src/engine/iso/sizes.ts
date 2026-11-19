import type { NodeKind } from "../../schema/graph.ts";

/** A box's size in grid units: w along x, d along y, h up. */
export type BoxSize = { readonly w: number; readonly d: number; readonly h: number };

/** Default box size per node kind, in grid units. Layout and drawing both use these. */
export const KIND_SIZES: Readonly<Record<NodeKind, BoxSize>> = {
  actor: { w: 2.6, d: 2.4, h: 0.9 },
  service: { w: 3, d: 2.6, h: 0.9 },
  database: { w: 2.8, d: 2.6, h: 1.4 },
  queue: { w: 3.4, d: 1.6, h: 0.5 },
  document: { w: 2.4, d: 2.8, h: 0.4 },
  decision: { w: 2.6, d: 2.6, h: 0.9 },
  external: { w: 3, d: 2.6, h: 0.9 },
};

/** A node's footprint on the floor, in grid units: its corner, width along x and depth along y. */
export type Footprint = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
};

/** The footprint of a node of `kind` placed at `at`. */
export const footprintOf = (
  kind: NodeKind,
  at: { readonly x: number; readonly y: number },
): Footprint => ({ x: at.x, y: at.y, w: KIND_SIZES[kind].w, d: KIND_SIZES[kind].d });

/** How far a zone platform reaches beyond its members, in grid units. */
export const ZONE_MARGIN = 0.6;
