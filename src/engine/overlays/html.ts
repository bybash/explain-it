import type { BADGE_TONES } from "../../schema/storyboard.ts";
import type { NodeShape, Polygon } from "../iso/scene.ts";
import { categoryStyle } from "../theme/kinds.ts";
import type { State } from "../timeline.ts";
import { type CalloutPlacement, placeBadge, placeCallout } from "./place.ts";
import { LINE_HEIGHT, NARRATION_LINES, type Rect, STAGE, type StageRegions } from "./regions.ts";
import { overlayTarget } from "./tweens.ts";

/** One overlay to draw. `id` is unique among overlays and names its timeline target. */
export type OverlayDrawing =
  | {
      readonly kind: "callout";
      readonly id: string;
      readonly node: NodeShape["faces"];
      readonly title?: string;
      readonly text: string;
      /** The palette category of the node it points at. */
      readonly category: string;
    }
  | {
      readonly kind: "badge";
      readonly id: string;
      readonly node: NodeShape["faces"];
      readonly text: string;
      readonly tone: (typeof BADGE_TONES)[number];
    }
  | { readonly kind: "title" | "step" | "narration"; readonly id: string; readonly text: string };

/** Sets every overlay from the timeline's state; overlays missing from it stay hidden. */
export type ApplyOverlays = (state: State) => void;

/** How a scene's title reads on screen: "1 · Login" for the first scene. */
export const sceneTitleText = (index: number, title: string): string => `${index + 1} · ${title}`;

/** The radius of the dot that marks a callout's anchor on the node. */
const ANCHOR_DOT = 5;

const SVG_NS = "http://www.w3.org/2000/svg";

const div = (className: string, parent: Element, text?: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
};

const positionAt = (el: HTMLElement, rect: Rect): void => {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
};

/**
 * Draws overlays as HTML in `root`, which lies over the stage at the same
 * 1920×1080 pixel size, and returns the function that poses them for a
 * moment of the timeline. Captions and the title sit in their `regions`;
 * callouts are measured, then placed beside their node inside the content
 * region, away from `obstacles` (every node's faces). This is the browser
 * edge; placement and timing are in `place.ts` and `tweens.ts`.
 */
export const renderOverlays = (
  root: HTMLElement,
  overlays: readonly OverlayDrawing[],
  regions: StageRegions,
  obstacles: readonly Polygon[],
): ApplyOverlays => {
  root.replaceChildren();
  root.style.setProperty("--title-size", `${regions.fonts.title}px`);
  root.style.setProperty("--step-size", `${regions.fonts.step}px`);
  root.style.setProperty("--narration-size", `${regions.fonts.narration}px`);
  // The bands were sized for these, so the CSS takes them from here.
  root.style.setProperty("--caption-line", String(LINE_HEIGHT));
  root.style.setProperty("--narration-lines", String(NARRATION_LINES));
  const lines = document.createElementNS(SVG_NS, "svg");
  lines.setAttribute("class", "callout-lines");
  lines.setAttribute("viewBox", `0 0 ${STAGE.width} ${STAGE.height}`);
  root.appendChild(lines);

  const posers = overlays.map((overlay) => {
    const el = draw(root, lines, overlay, regions, obstacles);
    return (state: State): void => {
      const s = state[overlayTarget(overlay.id)] ?? {};
      const opacity = s.opacity ?? 0;
      for (const part of el) {
        part.style.visibility = opacity > 0 ? "visible" : "hidden";
        part.style.opacity = opacity.toFixed(3);
      }
      const [main] = el;
      if (main)
        main.style.transform = `translateY(${(s.shift ?? 0).toFixed(2)}px) scale(${(s.scale ?? 1).toFixed(3)})`;
    };
  });
  return (state) => {
    for (const pose of posers) pose(state);
  };
};

/** Draws one overlay; the first element returned moves, the rest only fade with it. */
const draw = (
  root: HTMLElement,
  lines: SVGSVGElement,
  overlay: OverlayDrawing,
  regions: StageRegions,
  obstacles: readonly Polygon[],
): (HTMLElement | SVGElement)[] => {
  switch (overlay.kind) {
    case "title": {
      const band = div("overlay scene-title", root);
      positionAt(band, regions.title);
      div("scene-title-chip", band, overlay.text);
      return [band];
    }
    case "step":
    case "narration": {
      const rect = regions[overlay.kind];
      if (!rect) return [];
      const band = div(`overlay caption ${overlay.kind}-caption`, root);
      positionAt(band, rect);
      div("caption-text", band, overlay.text);
      return [band];
    }
    case "badge": {
      const badge = div(`overlay badge tone-${overlay.tone}`, root);
      badge.style.setProperty("--tone", `var(--tone-${overlay.tone})`);
      div("badge-text", badge, overlay.text);
      const size = { width: badge.offsetWidth, height: badge.offsetHeight };
      const box = placeBadge(overlay.node, size, regions.content);
      badge.style.left = `${box.x}px`;
      badge.style.top = `${box.y}px`;
      return [badge];
    }
    case "callout": {
      const card = div("overlay callout", root);
      card.setAttribute("style", categoryStyle(overlay.category));
      if (overlay.title) div("callout-title", card, overlay.title);
      div("callout-text", card, overlay.text);
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      const placed = placeCallout(overlay.node, size, regions.content, obstacles);
      card.style.left = `${placed.box.x}px`;
      card.style.top = `${placed.box.y}px`;
      card.style.transformOrigin = ORIGIN[placed.side];
      card.dataset.side = placed.side;
      return [card, connector(lines, placed, overlay.category)];
    }
  }
};

/** Where a callout grows from: the side facing its node. */
const ORIGIN: Readonly<Record<CalloutPlacement["side"], string>> = {
  right: "left center",
  left: "right center",
  above: "center bottom",
  below: "center top",
};

const connector = (lines: SVGSVGElement, placed: CalloutPlacement, category: string) => {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "callout-line");
  g.setAttribute("style", categoryStyle(category));
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", placed.pointer.x.toFixed(1));
  line.setAttribute("y1", placed.pointer.y.toFixed(1));
  line.setAttribute("x2", placed.anchor.x.toFixed(1));
  line.setAttribute("y2", placed.anchor.y.toFixed(1));
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", placed.anchor.x.toFixed(1));
  dot.setAttribute("cy", placed.anchor.y.toFixed(1));
  dot.setAttribute("r", String(ANCHOR_DOT));
  g.append(line, dot);
  lines.appendChild(g);
  return g;
};
