import { STAGE } from "../../schema/checks.ts";
import type { BADGE_TONES } from "../../schema/storyboard.ts";
import type { NodeShape, Polygon } from "../iso/scene.ts";
import { dimOpacity } from "../iso/tweens.ts";
import { categoryStyle } from "../theme/kinds.ts";
import type { State } from "../timeline.ts";
import { type CalloutPlacement, placeBadge, placeCallout } from "./place.ts";
import { LINE_HEIGHT, NARRATION_LINES, type Rect, type StageRegions } from "./regions.ts";
import { overlayTarget } from "./tweens.ts";

/** When an overlay is on screen, in seconds. */
export type Interval = { readonly at: number; readonly until: number };

/**
 * One overlay to draw. `id` is unique among overlays and names its timeline
 * target. `shown` says when it is on screen, so a callout keeps clear of the
 * badges and callouts showing at the same time; without it, it counts as
 * always showing.
 */
export type OverlayDrawing = { readonly shown?: Interval } & (
  | {
      readonly kind: "callout";
      readonly id: string;
      /** The node it points at, for the checks to know a callout is meant to sit by it. */
      readonly nodeId: string;
      readonly node: NodeShape["faces"];
      readonly title?: string;
      readonly text: string;
      /** The palette category of the node it points at. */
      readonly category: string;
    }
  | {
      readonly kind: "badge";
      readonly id: string;
      readonly nodeId: string;
      readonly node: NodeShape["faces"];
      readonly text: string;
      readonly tone: (typeof BADGE_TONES)[number];
    }
  | { readonly kind: "title" | "step" | "narration"; readonly id: string; readonly text: string }
  | {
      readonly kind: "list";
      readonly id: string;
      readonly text: string;
      /** Which scene's list it is in, and its place there. */
      readonly scene: string;
      readonly index: number;
    }
);

/** Sets every overlay from the timeline's state; overlays missing from it stay hidden. */
export type ApplyOverlays = (state: State) => void;

/** How a scene's title reads on screen: "1 · Login" for the first scene, or just "Login" when it is the only one. */
export const sceneTitleText = (index: number, title: string, scenes: number): string =>
  scenes === 1 ? title : `${index + 1} · ${title}`;

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
 * region, away from `obstacles` (every node's faces) and from the badges and
 * callouts on screen with them. This is the browser edge; placement and
 * timing are in `place.ts` and `tweens.ts`.
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
  root.style.setProperty("--step-lines", String(regions.stepLines));
  const lines = document.createElementNS(SVG_NS, "svg");
  lines.setAttribute("class", "callout-lines");
  lines.setAttribute("viewBox", `0 0 ${STAGE.width} ${STAGE.height}`);
  root.appendChild(lines);

  // Badges have fixed places, so they go first and callouts move around them.
  const ordered = [
    ...overlays.filter((o) => o.kind !== "callout"),
    ...overlays.filter((o) => o.kind === "callout"),
  ];
  const cards: { readonly box: Polygon; readonly shown?: Interval }[] = [];
  const posers = ordered.map((overlay) => {
    const showing = cards.filter((c) => together(c.shown, overlay.shown)).map((c) => c.box);
    const el = draw(root, lines, overlay, regions, [...obstacles, ...showing]);
    const [main] = el;
    if ((overlay.kind === "badge" || overlay.kind === "callout") && main instanceof HTMLElement)
      cards.push({ box: boxOf(main), ...(overlay.shown ? { shown: overlay.shown } : {}) });
    return (state: State): void => {
      const s = state[overlayTarget(overlay.id)] ?? {};
      // A badge or callout fades with the node it is on (`dim`, see `focusTweens`); a line of the
      // beat list fades once its beat is over (`faded`).
      const opacity = (s.opacity ?? 0) * dimOpacity(s.dim) * (1 - LIST_FADE * (s.faded ?? 0));
      for (const part of el) {
        part.style.visibility = opacity > 0 ? "visible" : "hidden";
        part.style.opacity = opacity.toFixed(3);
      }
      const [main] = el;
      if (main)
        main.style.transform = `translateY(${(s.shift ?? 0).toFixed(2)}px) scale(${(s.scale ?? 1).toFixed(3)})`;
    };
  });
  const fitList = listFitter(root, regions);
  return (state) => {
    for (const pose of posers) pose(state);
    fitList();
  };
};

/** How much a line of the beat list fades once its beat is over: to 45% (decision 048). */
const LIST_FADE = 0.55;
/** The gap between the lines of the beat list, in pixels. */
const LIST_GAP = 18;

/**
 * Stacks each scene's list lines in the list's column, in order, the lines
 * on screen only: down from its top, or, in the bottom-left corner, up to its
 * bottom. When they do not fit the column, the oldest (faded) ones
 * leave from the top and the rest move up, so a long scene's list never
 * runs into the narration. It depends only on which lines are on screen, so
 * a frame is the same however it was reached.
 */
const listFitter = (root: HTMLElement, regions: StageRegions): (() => void) => {
  const column = regions.list;
  if (!column) return () => {};
  const byScene = new Map<string, { readonly el: HTMLElement; readonly height: number }[]>();
  for (const el of root.querySelectorAll<HTMLElement>(".list-line")) {
    const scene = el.dataset.scene ?? "";
    byScene.set(scene, [...(byScene.get(scene) ?? []), { el, height: el.offsetHeight }]);
  }
  for (const lines of byScene.values())
    lines.sort((a, b) => Number(a.el.dataset.index) - Number(b.el.dataset.index));
  return () => {
    for (const lines of byScene.values()) {
      const shown = lines.filter((line) => line.el.style.visibility === "visible");
      let total = shown.reduce((sum, line) => sum + line.height + LIST_GAP, -LIST_GAP);
      let dropped = 0;
      while (total > column.height && dropped < shown.length - 1) {
        total -= (shown[dropped]?.height ?? 0) + LIST_GAP;
        dropped++;
      }
      // At the top the list hangs from the column's top; in the bottom-left corner it rises from its bottom.
      let top =
        regions.place === "bottom" ? column.y + column.height - Math.max(0, total) : column.y;
      for (const [i, line] of shown.entries()) {
        if (i < dropped) {
          line.el.style.visibility = "hidden";
          continue;
        }
        line.el.style.top = `${top}px`;
        top += line.height + LIST_GAP;
      }
    }
  };
};

/** Whether two overlays are on screen at the same moment; one without times always is. */
const together = (a: Interval | undefined, b: Interval | undefined): boolean =>
  a === undefined || b === undefined || (a.at < b.until && b.at < a.until);

/** An absolutely placed element's box, as a polygon, from where it was put. */
const boxOf = (el: HTMLElement): Polygon => {
  const x = Number.parseFloat(el.style.left);
  const y = Number.parseFloat(el.style.top);
  const [w, h] = [el.offsetWidth, el.offsetHeight];
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
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
    case "list": {
      if (!regions.list) return [];
      const line = div("overlay caption list-line", root);
      line.dataset.scene = overlay.scene;
      line.dataset.index = String(overlay.index);
      line.style.left = `${regions.list.x}px`;
      line.style.width = `${regions.list.width}px`;
      div("caption-text", line, overlay.text);
      return [line];
    }
    case "step":
    case "narration": {
      const rect = regions[overlay.kind];
      if (!rect) return [];
      // In the bottom-left corner, a step caption sits on the bottom of its band, over the narration.
      const corner = overlay.kind === "step" && regions.place === "bottom" ? " in-corner" : "";
      const band = div(`overlay caption ${overlay.kind}-caption${corner}`, root);
      positionAt(band, rect);
      div("caption-text", band, overlay.text);
      return [band];
    }
    case "badge": {
      const badge = div(`overlay badge tone-${overlay.tone}`, root);
      badge.dataset.node = overlay.nodeId;
      badge.style.setProperty("--tone", `var(--tone-${overlay.tone})`);
      // A tag with pointed ends, so a node's state never reads as an edge's label pill: its outline in the tone, a grey fill.
      div("badge-shape", badge);
      div("badge-fill", badge);
      div("badge-text", badge, overlay.text);
      const size = { width: badge.offsetWidth, height: badge.offsetHeight };
      const box = placeBadge(overlay.node, size, regions.content, obstacles);
      badge.style.left = `${box.x}px`;
      badge.style.top = `${box.y}px`;
      return [badge];
    }
    case "callout": {
      const card = div("overlay callout", root);
      card.dataset.node = overlay.nodeId;
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
