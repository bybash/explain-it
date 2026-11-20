import type { EndCard, Logo, TitleCard } from "../../schema/config.ts";
import { type CardPlan, cardTarget } from "../beats/build.ts";
import { logoBox } from "../overlays/regions.ts";
import type { State } from "../timeline.ts";
import { qrModules, qrPath } from "./qr.ts";
import { type LogoPlace, logoShowsOn } from "./show.ts";

/** The logo to draw: the image for the current mode, and where and when it shows. */
export type LogoDrawing = {
  readonly src: string;
  readonly corner: Logo["corner"];
  readonly show: Logo["show"];
};

/** Poses a layer from the timeline. */
export type Poser = (state: State) => void;

/** The logo in the middle of the closing card is fitted inside this box (SPEC, Logo). */
export const MIDDLE_LOGO_SIZE = { width: 480, height: 160 } as const;

/** The QR code's quiet zone, in modules: the light margin a reader needs around it. */
const QR_QUIET = 4;
const SVG_NS = "http://www.w3.org/2000/svg";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The logo as an `<img>`, so an SVG runs no script. */
const logoElement = (src: string, className: string): HTMLImageElement => {
  const img = element("img", className);
  img.alt = "";
  img.src = src;
  return img;
};

/** The logo fitted inside its corner box and pushed to the box's outer corner. */
export const logoImage = (logo: LogoDrawing): HTMLImageElement => {
  const box = logoBox(logo.corner);
  const img = logoElement(logo.src, "logo");
  Object.assign(img.style, {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    objectPosition: logo.corner === "top-right" ? "right top" : "right bottom",
  });
  return img;
};

/** Sets a layer's opacity from the timeline, hiding it altogether at 0. */
const fadeLayer =
  (layer: HTMLElement, target: string): Poser =>
  (state) => {
    const opacity = state[target]?.opacity ?? 0;
    layer.style.visibility = opacity > 0 ? "visible" : "hidden";
    layer.style.opacity = opacity.toFixed(3);
  };

/** A card's full-frame layer with `body` in the middle and the logo in its corner when `place` shows it. */
const cardLayer = (
  frame: HTMLElement,
  id: CardPlan["id"],
  body: HTMLElement,
  logo: LogoDrawing | undefined,
  place: LogoPlace,
): Poser => {
  const layer = element("div", `card-layer card-${id}`);
  layer.append(body);
  if (logo && logoShowsOn(logo.show, place)) layer.append(logoImage(logo));
  frame.append(layer);
  return fadeLayer(layer, cardTarget(id));
};

/**
 * Draws the title card, opening the video or closing it again: the title in
 * the middle, the description under it, and the logo in its corner.
 */
export const renderTitleCard = (
  frame: HTMLElement,
  id: "title" | "title-again",
  card: TitleCard,
  logo: LogoDrawing | undefined,
): Poser => {
  const body = element("div", "card-body");
  body.append(element("h1", "card-title", card.title), element("div", "card-rule"));
  if (card.description !== undefined)
    body.append(element("p", "card-description", card.description));
  return cardLayer(frame, id, body, logo, "title");
};

/** The link as a QR code: dark modules on a light tile in both modes, as readers expect. */
const qrCode = (link: string): SVGSVGElement => {
  const modules = qrModules(link);
  const size = modules.length + 2 * QR_QUIET;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "card-qr");
  svg.setAttribute("viewBox", `${-QR_QUIET} ${-QR_QUIET} ${size} ${size}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  const tile = document.createElementNS(SVG_NS, "rect");
  tile.setAttribute("class", "card-qr-tile");
  for (const [name, value] of Object.entries({
    x: -QR_QUIET,
    y: -QR_QUIET,
    width: size,
    height: size,
  }))
    tile.setAttribute(name, String(value));
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "card-qr-modules");
  path.setAttribute("d", qrPath(modules));
  svg.append(tile, path);
  return svg;
};

/**
 * Draws the end card: the headline, then the link with its QR code beside
 * it, then where to find the feature and the credit, and the logo in its
 * corner.
 */
export const renderEndCard = (
  frame: HTMLElement,
  card: EndCard,
  logo: LogoDrawing | undefined,
): Poser => {
  const body = element("div", "card-body");
  body.append(
    element("h1", "card-title card-headline", card.headline),
    element("div", "card-rule"),
  );
  if (card.link !== undefined) {
    const row = element("div", "card-link-row");
    row.append(qrCode(card.link), element("p", "card-link", card.link));
    body.append(row);
  }
  if (card.where !== undefined) body.append(element("p", "card-where", card.where));
  if (card.credit !== undefined) body.append(element("p", "card-credit", card.credit));
  return cardLayer(frame, "end", body, logo, "end");
};

/** Draws the closing card made of the logo alone, in the middle, larger than in its corner. */
export const renderLogoCard = (frame: HTMLElement, src: string): Poser => {
  const img = logoElement(src, "logo-middle");
  Object.assign(img.style, {
    width: `${MIDDLE_LOGO_SIZE.width}px`,
    height: `${MIDDLE_LOGO_SIZE.height}px`,
  });
  const layer = element("div", "card-layer card-logo");
  layer.append(img);
  frame.append(layer);
  return fadeLayer(layer, cardTarget("logo"));
};

/**
 * A logo shown on every frame: a layer above the scenes and the cards. It
 * makes way while the logo itself closes the video in the middle.
 */
export const renderLogoLayer = (frame: HTMLElement, logo: LogoDrawing): Poser => {
  const layer = element("div", "logo-layer");
  layer.append(logoImage(logo));
  frame.append(layer);
  const middle = cardTarget("logo");
  return (state) => {
    layer.style.opacity = (1 - (state[middle]?.opacity ?? 0)).toFixed(3);
  };
};
