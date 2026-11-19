import type { Polygon, Scene } from "./scene.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

type Attributes = Readonly<Record<string, string | number>>;

const element = (tag: string, attributes: Attributes, parent?: Element): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  parent?.appendChild(el);
  return el;
};

const points = (polygon: Polygon): string =>
  polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/**
 * Draws a scene into `root` as SVG: floor, then zones, an empty `.edges`
 * layer, nodes in depth order, and an empty `.edge-labels` layer. The empty
 * layers are filled by `renderEdges`. Colours come from CSS custom
 * properties, so themes need no code. This is the thin browser edge of the
 * engine; the geometry is all in `buildScene`, which is unit-tested.
 */
export const renderScene = (root: SVGSVGElement, scene: Scene): void => {
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
  for (const zone of scene.zones) {
    const g = element("g", { class: "zone", "data-id": zone.id }, zones);
    element("polygon", { points: points(zone.polygon) }, g);
    const corner = zone.polygon[3];
    if (corner) {
      const label = element("text", { x: corner.x + 12, y: corner.y - 10 }, g);
      label.textContent = zone.label;
    }
  }

  // Edges lie on the floor, so they go over the zones and under the nodes.
  element("g", { class: "edges" }, root);

  const nodes = element("g", { class: "nodes" }, root);
  for (const node of scene.nodes) {
    const g = element("g", { class: `node kind-${node.kind}`, "data-id": node.id }, nodes);
    element("polygon", { class: "face-left", points: points(node.faces.left) }, g);
    element("polygon", { class: "face-right", points: points(node.faces.right) }, g);
    element("polygon", { class: "face-top", points: points(node.faces.top) }, g);
    const { width, depth, transform } = node.topContent;
    const top = element("g", { transform: `matrix(${transform.join(",")})` }, g);
    const label = element(
      "text",
      { class: "label", x: width / 2, y: depth * LABEL_LINE, "text-anchor": "middle" },
      top,
    );
    label.textContent = node.label;
    fitWidth(label as SVGTextElement, width * LABEL_WIDTH);
  }

  // Edge labels stand upright above everything, so a box never hides one.
  element("g", { class: "edge-labels" }, root);
};

/**
 * Where the label's baseline sits, as a share of the top face's depth. The
 * area above it is kept for the node's icon, which arrives with slice 1.6.
 */
const LABEL_LINE = 0.76;

/** Share of the top face's width a label may use. */
const LABEL_WIDTH = 0.82;

/** Shrinks a label's font until it fits `maxWidth`; it only measures, so it needs a live DOM. */
const fitWidth = (text: SVGTextElement, maxWidth: number): void => {
  const width = text.getComputedTextLength();
  if (width <= maxWidth) return;
  const size = Number.parseFloat(getComputedStyle(text).fontSize);
  text.style.fontSize = `${(size * maxWidth) / width}px`;
};
