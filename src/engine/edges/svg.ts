import type { ScreenPoint } from "../iso/project.ts";
import { NODE_TIMING } from "../iso/tweens.ts";
import { categoryStyle } from "../theme/kinds.ts";
import type { State } from "../timeline.ts";
import { edgeTarget } from "./flow.ts";
import { type EdgeGeometry, placeLabel } from "./geometry.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

type Attributes = Readonly<Record<string, string | number>>;

const element = (tag: string, attributes: Attributes, parent: Element): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  parent.appendChild(el);
  return el;
};

const pointList = (points: readonly ScreenPoint[]): string =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

export type EdgeDrawing = {
  readonly id: string;
  readonly geometry: EdgeGeometry;
  readonly label?: string;
  /** The palette category it is coloured with. */
  readonly category: string;
};

/** Sets every edge from the timeline's state; edges missing from it stay hidden. */
export type ApplyEdges = (state: State) => void;

/** Arrowhead length and half-width, in pixels. */
const ARROW = { length: 16, halfWidth: 7 };
/** Space around a label inside its pill, in pixels. */
const PILL_PADDING = { x: 12, y: 7 };

/** Where edges are drawn: lines on the floor under the nodes, labels above them. */
export type EdgeLayers = { readonly lines: SVGGElement; readonly labels: SVGGElement };

/**
 * Draws edges and returns the function that poses them for a moment of the
 * timeline. Each edge is a solid line, flowing dashes over it, an arrowhead
 * at the tip of the drawn part, a travelling dot, and a label pill, all in
 * the edge's category colour from the theme. A `dim` state fades it back
 * with the nodes.
 */
export const renderEdges = (
  layers: EdgeLayers,
  edges: readonly EdgeDrawing[],
  /** The boxes' outlines, which labels keep clear of. */
  boxes: readonly (readonly ScreenPoint[])[] = [],
): ApplyEdges => {
  layers.lines.replaceChildren();
  layers.labels.replaceChildren();
  // Each label keeps clear of the boxes and of the labels placed before it.
  const avoid = [...boxes];
  const posers = edges.map(({ id, geometry, label, category }) => {
    const style = categoryStyle(category);
    const g = element("g", { class: "edge", "data-id": id, style }, layers.lines);
    const line = element("polyline", { class: "edge-line" }, g);
    const dashes = element("polyline", { class: "edge-dashes" }, g);
    const arrow = element("polygon", { class: "edge-arrow" }, g);
    const dot = element("circle", { class: "edge-dot", r: 8 }, g);
    const pill = label ? labelPill(layers.labels, id, label, geometry, style, avoid) : undefined;

    return (state: State): void => {
      const s = state[edgeTarget(id)] ?? {};
      const draw = s.draw ?? 0;
      const visibility = draw > 0 ? "visible" : "hidden";
      g.setAttribute("visibility", visibility);
      pill?.setAttribute("visibility", visibility);
      if (draw <= 0) return;
      const faded = 1 - (s.dim ?? 0) * (1 - NODE_TIMING.dimmed);
      g.setAttribute("opacity", faded.toFixed(3));
      const points = pointList(geometry.drawn(draw));
      line.setAttribute("points", points);
      dashes.setAttribute("points", points);
      dashes.setAttribute("stroke-dashoffset", (-(s.dash ?? 0)).toFixed(2));
      arrow.setAttribute("points", pointList(arrowHead(geometry, draw)));
      const travel = geometry.pointAt((s.dot ?? 0) * geometry.length);
      dot.setAttribute("cx", travel.at.x.toFixed(2));
      dot.setAttribute("cy", travel.at.y.toFixed(2));
      dot.setAttribute("opacity", (s.dotOpacity ?? 0).toFixed(3));
      pill?.setAttribute("opacity", ((s.label ?? 0) * faded).toFixed(3));
    };
  });
  return (state) => {
    for (const pose of posers) pose(state);
  };
};

const arrowHead = (geometry: EdgeGeometry, draw: number): ScreenPoint[] => {
  const { at, direction: u } = geometry.pointAt(draw * geometry.length);
  const base = { x: at.x - u.x * ARROW.length, y: at.y - u.y * ARROW.length };
  const side = { x: -u.y * ARROW.halfWidth, y: u.x * ARROW.halfWidth };
  return [
    at,
    { x: base.x + side.x, y: base.y + side.y },
    { x: base.x - side.x, y: base.y - side.y },
  ];
};

/**
 * An upright pill on its edge's line, where it covers no box and no label
 * already placed (see `placeLabel`), which it then joins in `avoid`. It
 * measures its text first, so it needs a live DOM.
 */
const labelPill = (
  parent: Element,
  id: string,
  text: string,
  geometry: EdgeGeometry,
  style: string,
  avoid: (readonly ScreenPoint[])[],
): SVGElement => {
  const g = element("g", { class: "edge-label", "data-id": id, opacity: 0, style }, parent);
  const rect = element("rect", {}, g);
  const label = element(
    "text",
    { "text-anchor": "middle", "dominant-baseline": "central" },
    g,
  ) as SVGTextElement;
  label.textContent = text;
  const box = label.getBBox();
  const width = box.width + 2 * PILL_PADDING.x;
  const height = box.height + 2 * PILL_PADDING.y;
  const at = placeLabel(geometry.points, { width, height }, avoid, geometry.label);
  label.setAttribute("x", at.x.toFixed(2));
  label.setAttribute("y", at.y.toFixed(2));
  avoid.push([
    { x: at.x - width / 2, y: at.y - height / 2 },
    { x: at.x + width / 2, y: at.y - height / 2 },
    { x: at.x + width / 2, y: at.y + height / 2 },
    { x: at.x - width / 2, y: at.y + height / 2 },
  ]);
  rect.setAttribute("x", (at.x - width / 2).toFixed(2));
  rect.setAttribute("y", (at.y - height / 2).toFixed(2));
  rect.setAttribute("width", width.toFixed(2));
  rect.setAttribute("height", height.toFixed(2));
  rect.setAttribute("rx", (height / 2).toFixed(2));
  return g;
};
