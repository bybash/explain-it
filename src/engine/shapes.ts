import type { Shape } from "../schema/checks.ts";
import type { Graph } from "../schema/graph.ts";

type Point = { readonly x: number; readonly y: number };

/** Whether an element shows: not hidden, not fully transparent, nor inside something that is. */
const shows = (element: Element): boolean =>
  element.checkVisibility({ opacityProperty: true, visibilityProperty: true });

/** An SVG shape's own points, in stage pixels (the page is the 1920 × 1080 stage). */
const screenPoints = (shape: SVGPolygonElement | SVGPolylineElement): Point[] => {
  const matrix = shape.getScreenCTM();
  if (!matrix) return [];
  return Array.from(shape.points, (p) => {
    const at = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: at.x, y: at.y };
  });
};

/**
 * An SVG element's own box, mapped onto the stage: for text laid flat on
 * the floor this is the slanted outline, where the box around it would
 * reach well past the letters.
 */
const outlineOf = (element: SVGGraphicsElement): Point[] => {
  const matrix = element.getScreenCTM();
  if (!matrix) return [];
  const { x, y, width, height } = element.getBBox();
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((p) => {
    const at = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: at.x, y: at.y };
  });
};

/** An element's box on the stage, as a polygon. */
const boxOf = (element: Element): Point[] => {
  const r = element.getBoundingClientRect();
  return [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.right, y: r.bottom },
    { x: r.left, y: r.bottom },
  ];
};

/** Edges are drawn per scene, tagged `<scene>/<edge>`; the checks name the edge itself. */
const edgeId = (element: HTMLElement | SVGElement): string =>
  (element.dataset.id ?? "").split("/").at(-1) ?? "";

const visible = <T extends Element>(root: ParentNode, selector: string): T[] =>
  [...root.querySelectorAll<T>(selector)].filter(shows);

/**
 * Everything drawn on the stage now, as the checks measure it (SPEC,
 * Checks): each node's faces, each zone's platform and label, each edge as
 * drawn so far, and each overlay's box, with what it belongs to. Only what
 * shows counts; a scene that has faded out reports nothing.
 */
export const drawnShapes = (frame: ParentNode, graph: Graph): Shape[] => {
  const zoneOf = new Map(graph.nodes.map((n) => [n.id, n.zone]));
  const edgeEnds = new Map(graph.edges.map((e) => [e.id, e]));
  const shapes: Shape[] = [];
  for (const node of visible<SVGGElement>(frame, ".node[data-id]")) {
    const id = node.dataset.id ?? "";
    const zone = zoneOf.get(id);
    const faces = [...node.querySelectorAll<SVGPolygonElement>("polygon")].map(screenPoints);
    shapes.push({ kind: "node", id, ...(zone ? { zone } : {}), faces });
  }
  for (const zone of visible<SVGGElement>(frame, ".zone[data-id]")) {
    const id = zone.dataset.id ?? "";
    const platform = zone.querySelector<SVGPolygonElement>("polygon");
    if (platform) shapes.push({ kind: "zone", id, polygon: screenPoints(platform) });
    const label = zone.querySelector("text");
    if (label?.textContent)
      shapes.push({ kind: "zone-label", zone: id, polygon: outlineOf(label) });
  }
  for (const edge of visible<SVGGElement>(frame, ".edge[data-id]")) {
    const id = edgeId(edge);
    const line = edge.querySelector<SVGPolylineElement>(".edge-line");
    const endpoints = edgeEnds.get(id);
    if (line && endpoints)
      shapes.push({
        kind: "edge",
        id,
        from: endpoints.from,
        to: endpoints.to,
        points: screenPoints(line),
      });
  }
  for (const label of visible<SVGGElement>(frame, ".edge-label[data-id]"))
    shapes.push({
      kind: "overlay",
      role: "edge-label",
      edge: edgeId(label),
      polygon: boxOf(label),
    });
  const overlays: readonly [string, Extract<Shape, { kind: "overlay" }>["role"], string?][] = [
    [".scene-title .scene-title-chip", "title"],
    [".step-caption .caption-text", "step"],
    [".list-line .caption-text", "step"],
    [".narration-caption .caption-text", "narration"],
    [".overlay.callout", "callout"],
    [".overlay.badge", "badge"],
    [".logo-layer img", "logo"],
  ];
  for (const [selector, role] of overlays)
    for (const element of visible<HTMLElement>(frame, selector)) {
      const node = element.dataset.node;
      shapes.push({ kind: "overlay", role, ...(node ? { node } : {}), polygon: boxOf(element) });
    }
  return shapes;
};
