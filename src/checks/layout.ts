import { safeArea } from "../engine/overlays/regions.ts";
import { type BeatWarning, OVERLAP_PX, type Shape } from "../schema/checks.ts";
import {
  convexHull,
  insideLength,
  outsideBy,
  overlapDepth,
  type Point,
  type Rect,
} from "./geometry.ts";

/** SPEC, Checks: the stage less its margin, which nothing should leave. */
export const SAFE_AREA: Rect = safeArea();

type Where = Pick<BeatWarning, "scene" | "beat" | "at">;
type Of<K extends Shape["kind"]> = Extract<Shape, { kind: K }>;

/** How an overlay is named in a message, by its role. */
const OVERLAY_NAMES: Readonly<Record<Of<"overlay">["role"], (o: Of<"overlay">) => string>> = {
  title: () => "the scene title",
  step: () => "the step caption",
  narration: () => "the narration caption",
  callout: (o) => `callout on "${o.node}"`,
  badge: (o) => `badge on "${o.node}"`,
  "edge-label": (o) => `the label of edge "${o.edge}"`,
  logo: () => "the logo",
};

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
      return OVERLAY_NAMES[shape.role](shape);
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
 * shapes drawn then. Overlaps deeper than `OVERLAP_PX` between:
 * - two nodes;
 * - a node and a zone it is not in, as a manual override can leave it;
 * - a zone's label and a node or an overlay that covers it;
 * - an edge and a node it does not connect;
 * - an overlay and a node, except a callout or badge on its own node;
 * - two overlays.
 * And anything that leaves the safe area.
 */
export const layoutWarnings = (shapes: readonly Shape[], where: Where): BeatWarning[] => {
  const of = <K extends Shape["kind"]>(kind: K) =>
    shapes.filter((s): s is Of<K> => s.kind === kind);
  const nodes = of("node");
  const zones = of("zone");
  const labels = of("zone-label");
  const edges = of("edge");
  const overlays = of("overlay");
  const warnings: BeatWarning[] = [];
  const warn = (check: BeatWarning["check"], px: number, message: string, of: readonly Shape[]) => {
    const nodeIds = of.flatMap((s) => (s.kind === "node" ? [s.id] : []));
    warnings.push({
      check,
      ...where,
      px: round(px),
      ...(nodeIds.length ? { nodes: nodeIds } : {}),
      message,
    });
  };
  const overlap = (a: Shape, b: Shape, say: (px: number) => string) => {
    const depth = overlapDepth(outline(a), outline(b));
    if (depth > OVERLAP_PX) warn("overlap", depth, say(round(depth)), [a, b]);
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
            [node],
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
      warn("off-frame", past, `${nameOf(shape)} leaves the safe area by ${round(past)} px`, [
        shape,
      ]);
  }
  return warnings;
};
