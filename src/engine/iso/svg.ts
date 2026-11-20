import { type IconNode, lucideIcon } from "../../schema/icons.ts";
import { categoryStyle } from "../theme/kinds.ts";
import type { State } from "../timeline.ts";
import type { Polygon, Scene } from "./scene.ts";
import { NODE_TIMING } from "./tweens.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

type Attributes = Readonly<Record<string, string | number | undefined>>;

const element = (tag: string, attributes: Attributes, parent?: Element): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes))
    if (value !== undefined) el.setAttribute(name, String(value));
  parent?.appendChild(el);
  return el;
};

const points = (polygon: Polygon): string =>
  polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Sets every node and zone from the timeline's state; one missing from it shows in full. */
export type ApplyNodes = (state: State) => void;

/** How far a highlighted node lifts, in pixels, and how wide its glow spreads at the peak. */
const PULSE = { lift: 8, glow: 22 };

/**
 * Draws a scene into `root` as SVG: floor, then zones, an empty `.edges`
 * layer, nodes in depth order, and an empty `.edge-labels` layer. The empty
 * layers are filled by `renderEdges`. Colours come from the theme's CSS
 * custom properties (see `stage.css`); each element names its category. This is the thin browser edge of the
 * engine; the geometry is all in `buildScene`, which is unit-tested.
 * Returns the function that poses nodes and zones for a moment of the
 * timeline, reading their state from the `targets` named for each id, such as
 * `nodeTarget` and `zoneTarget` (see `iso/tweens.ts`).
 */
export const renderScene = (
  root: SVGSVGElement,
  scene: Scene,
  targets: { readonly node: (id: string) => string; readonly zone: (id: string) => string },
): ApplyNodes => {
  root.replaceChildren();

  const floor = element("g", { class: "floor" }, root);
  for (const dot of scene.floor) {
    element(
      "circle",
      {
        cx: dot.at.x.toFixed(1),
        cy: dot.at.y.toFixed(1),
        r: dot.major ? 2.2 : 1.2,
        opacity: dot.opacity.toFixed(2),
      },
      floor,
    );
  }

  const zones = element("g", { class: "zones" }, root);
  const zonePosers = scene.zones.map((zone) => {
    const g = element(
      "g",
      { class: "zone", "data-id": zone.id, style: categoryStyle(zone.category) },
      zones,
    );
    element("polygon", { points: points(zone.polygon) }, g);
    const corner = zone.polygon[3];
    if (corner) {
      const label = element("text", { x: corner.x + 12, y: corner.y - 10 }, g);
      label.textContent = zone.label;
    }
    const target = targets.zone(zone.id);
    return (state: State): void => {
      const shown = state[target]?.shown ?? 1;
      g.setAttribute("visibility", shown > 0 ? "visible" : "hidden");
      g.setAttribute("opacity", shown.toFixed(3));
    };
  });

  // Edges lie on the floor, so they go over the zones and under the nodes.
  element("g", { class: "edges" }, root);

  const nodes = element("g", { class: "nodes" }, root);
  const posers = scene.nodes.map((node) => {
    const g = element(
      "g",
      { class: `node kind-${node.kind}`, "data-id": node.id, style: categoryStyle(node.category) },
      nodes,
    );
    element("polygon", { class: "face-left", points: points(node.faces.left) }, g);
    element("polygon", { class: "face-right", points: points(node.faces.right) }, g);
    element("polygon", { class: "face-top", points: points(node.faces.top) }, g);
    const { width, depth, transform } = node.topContent;
    const top = element("g", { transform: `matrix(${transform.join(",")})` }, g);
    const icon = lucideIcon(node.icon);
    if (icon) drawIcon(top, icon, width, depth);
    const label = element(
      "text",
      { class: "label", x: width / 2, y: depth * LABEL_LINE, "text-anchor": "middle" },
      top,
    );
    label.textContent = node.label;
    fitWidth(label as SVGTextElement, width * LABEL_WIDTH);
    return poseNode(g, targets.node(node.id));
  });

  // Edge labels stand upright above everything, so a box never hides one.
  element("g", { class: "edge-labels" }, root);
  return (state) => {
    for (const pose of [...zonePosers, ...posers]) pose(state);
  };
};

/** `shown` raises the node into place, `dim` fades it back, `pulse` lifts it with a glow. */
const poseNode =
  (g: SVGElement, target: string) =>
  (state: State): void => {
    const s = state[target] ?? {};
    const shown = s.shown ?? 1;
    const pulse = s.pulse ?? 0;
    const opacity = shown * (1 - (s.dim ?? 0) * (1 - NODE_TIMING.dimmed));
    g.setAttribute("visibility", opacity > 0 ? "visible" : "hidden");
    g.setAttribute("opacity", opacity.toFixed(3));
    const y = (1 - shown) * NODE_TIMING.rise - pulse * PULSE.lift;
    g.setAttribute("transform", `translate(0 ${y.toFixed(2)})`);
    g.style.filter =
      pulse > 0 ? `drop-shadow(0 0 ${(pulse * PULSE.glow).toFixed(1)}px var(--cat))` : "";
  };

/** Where the label's baseline sits, as a share of the top face's depth; the icon is above it. */
const LABEL_LINE = 0.76;

/** The icon's centre, as a share of the top face's depth, and its largest size as shares of the face. */
const ICON = { centre: 0.4, ofWidth: 0.34, ofDepth: 0.4 };

/** Lucide draws on a 24 by 24 grid with 2-unit strokes. */
const LUCIDE_GRID = 24;
const LUCIDE_STROKE = 2;

/** Draws a Lucide icon centred above the label, lying flat on the top face like the label. */
const drawIcon = (parent: Element, icon: IconNode, width: number, depth: number): void => {
  const size = Math.min(width * ICON.ofWidth, depth * ICON.ofDepth);
  const scale = size / LUCIDE_GRID;
  const g = element(
    "g",
    {
      class: "icon",
      "stroke-width": LUCIDE_STROKE,
      transform: `translate(${(width - size) / 2},${depth * ICON.centre - size / 2}) scale(${scale})`,
    },
    parent,
  );
  for (const [tag, attributes] of icon) {
    element(tag, attributes, g);
  }
};

/** Share of the top face's width a label may use. */
const LABEL_WIDTH = 0.82;

/** Shrinks a label's font until it fits `maxWidth`; it only measures, so it needs a live DOM. */
const fitWidth = (text: SVGTextElement, maxWidth: number): void => {
  const width = text.getComputedTextLength();
  if (width <= maxWidth) return;
  const size = Number.parseFloat(getComputedStyle(text).fontSize);
  text.style.fontSize = `${(size * maxWidth) / width}px`;
};
