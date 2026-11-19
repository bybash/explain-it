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
 * Draws a scene into `root` as SVG: floor, then zones, then nodes in depth
 * order. Colours come from CSS custom properties, so themes need no code.
 * This is the thin browser edge of the engine; the geometry is all in
 * `buildScene`, which is unit-tested.
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

  const nodes = element("g", { class: "nodes" }, root);
  for (const node of scene.nodes) {
    const g = element("g", { class: `node kind-${node.kind}`, "data-id": node.id }, nodes);
    element("polygon", { class: "face-left", points: points(node.faces.left) }, g);
    element("polygon", { class: "face-right", points: points(node.faces.right) }, g);
    element("polygon", { class: "face-top", points: points(node.faces.top) }, g);
    const top = element("g", { transform: `matrix(${node.top.transform.join(",")})` }, g);
    const label = element(
      "text",
      { class: "label", x: node.top.width / 2, y: node.top.depth * 0.6, "text-anchor": "middle" },
      top,
    );
    label.textContent = node.label;
    fitWidth(label as SVGTextElement, node.top.width * LABEL_WIDTH);
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
