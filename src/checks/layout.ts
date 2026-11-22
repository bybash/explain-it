import type { CheckWarning, Shape } from "../schema/checks.ts";
import {
  convexHull,
  insideLength,
  outsideBy,
  overlapDepth,
  type Point,
  type Rect,
} from "./geometry.ts";

/** Two shapes may overlap by this much before it counts (SPEC, Checks). */
export const OVERLAP_PX = 4;
const STAGE = { width: 1920, height: 1080 };
/** SPEC, Checks: the safe area is the stage less a 5 % margin on every side. */
const MARGIN = 0.05;
export const SAFE_AREA: Rect = {
  x: STAGE.width * MARGIN,
  y: STAGE.height * MARGIN,
  width: STAGE.width * (1 - 2 * MARGIN),
  height: STAGE.height * (1 - 2 * MARGIN),
};

type Where = Pick<CheckWarning, "scene" | "beat" | "at">;
type Of<K extends Shape["kind"]> = Extract<Shape, { kind: K }>;

/** What a shape is called in a message. */
const nameOf = (shape: Shape): string => {
  switch (shape.kind) {
    case "node":
      return `node "${shape.id}"`;
    case "zone":
      return `zone "${shape.id}"`;
    case "zone-label":
      return `zone "${shape.zone}"'s label`;
    case "edge":
      return `edge "${shape.id}"`;
    case "overlay":
      if (shape.role === "callout" || shape.role === "badge")
        return `${shape.role} on "${shape.node}"`;
      if (shape.role === "edge-label") return `the label of edge "${shape.edge}"`;
      return shape.role === "logo"
        ? "the logo"
        : `the ${shape.role === "title" ? "scene title" : `${shape.role} caption`}`;
  }
};

/** A shape's outline: a node's box is the hull of its faces. */
const outline = (shape: Shape): readonly Point[] => {
  switch (shape.kind) {
    case "node":
      return convexHull(shape.faces.flat());
    case "edge":
      return shape.points;
    default:
      return shape.polygon;
  }
};

const round = (px: number) => Math.round(px * 10) / 10;

/**
 * The layout problems at one moment of the video (SPEC, Checks), from the
 * shapes drawn then. Overlaps of more than 4 px between:
 * - two nodes;
 * - a node and a zone it is not in, as a manual override can leave it;
 * - a zone's label and a node or an overlay that covers it;
 * - an edge and a node it does not connect;
 * - an overlay and a node, except a callout or badge on its own node;
 * - two overlays.
 * And anything that leaves the safe area.
 */
export const layoutWarnings = (shapes: readonly Shape[], where: Where): CheckWarning[] => {
  const of = <K extends Shape["kind"]>(kind: K) =>
    shapes.filter((s): s is Of<K> => s.kind === kind);
  const nodes = of("node");
  const zones = of("zone");
  const labels = of("zone-label");
  const edges = of("edge");
  const overlays = of("overlay");
  const warnings: CheckWarning[] = [];
  const warn = (check: CheckWarning["check"], px: number, message: string) =>
    warnings.push({ check, ...where, px: round(px), message });
  const overlap = (a: Shape, b: Shape, say: (px: number) => string) => {
    const depth = overlapDepth(outline(a), outline(b));
    if (depth > OVERLAP_PX) warn("overlap", depth, say(round(depth)));
  };
  const pairs = <T>(list: readonly T[]) =>
    list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b] as const));

  for (const [a, b] of pairs(nodes))
    overlap(a, b, (px) => `${nameOf(a)} and ${nameOf(b)} overlap by ${px} px`);
  for (const node of nodes)
    for (const zone of zones)
      if (node.zone !== zone.id)
        overlap(
          node,
          zone,
          (px) => `${nameOf(node)} sits on ${nameOf(zone)}, which it is not in, by ${px} px`,
        );
  for (const label of labels)
    for (const cover of [...nodes, ...overlays])
      overlap(label, cover, (px) => `${nameOf(label)} is covered by ${nameOf(cover)} by ${px} px`);
  for (const edge of edges)
    for (const node of nodes)
      if (node.id !== edge.from && node.id !== edge.to) {
        const length = insideLength(edge.points, outline(node));
        if (length > OVERLAP_PX)
          warn(
            "overlap",
            length,
            `${nameOf(edge)} runs through ${nameOf(node)} for ${round(length)} px`,
          );
      }
  for (const overlay of overlays)
    for (const node of nodes)
      if (overlay.node !== node.id)
        overlap(overlay, node, (px) => `${nameOf(overlay)} covers ${nameOf(node)} by ${px} px`);
  for (const [a, b] of pairs(overlays))
    overlap(a, b, (px) => `${nameOf(a)} and ${nameOf(b)} overlap by ${px} px`);

  for (const shape of shapes) {
    const past = outsideBy(outline(shape), SAFE_AREA);
    if (past > 0)
      warn("off-frame", past, `${nameOf(shape)} leaves the safe area by ${round(past)} px`);
  }
  return warnings;
};
