import type { Logo, TitleCard } from "../../schema/config.ts";
import { cardTarget } from "../beats/build.ts";
import { logoBox } from "../overlays/regions.ts";
import type { State } from "../timeline.ts";

/** The logo's images, one per mode, as URLs the page can load (data URLs when rendering). */
export type LogoImages = { readonly light: string; readonly dark: string };

/** The logo to draw: the image for the current mode, and where and when it shows. */
export type LogoDrawing = {
  readonly src: string;
  readonly corner: Logo["corner"];
  readonly show: Logo["show"];
};

/**
 * The logo as an `<img>`, so an SVG runs no script, fitted inside its corner
 * box and pushed to the box's outer corner.
 */
export const logoImage = (logo: LogoDrawing): HTMLImageElement => {
  const box = logoBox(logo.corner);
  const img = document.createElement("img");
  img.className = "logo";
  img.alt = "";
  img.src = logo.src;
  Object.assign(img.style, {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    objectPosition: logo.corner === "top-right" ? "right top" : "right bottom",
  });
  return img;
};

/** The logo is drawn on the title card itself, unless it has a layer of its own on every frame. */
const onTitleCard = (logo: LogoDrawing | undefined): logo is LogoDrawing =>
  logo !== undefined && (logo.show === "start" || logo.show === "both");

/**
 * Draws the title card on a layer of its own and returns the function that
 * poses it from the timeline: the title in the middle, the description under
 * it, and the logo in its corner.
 */
export const renderTitleCard = (
  frame: HTMLElement,
  card: TitleCard,
  logo: LogoDrawing | undefined,
): ((state: State) => void) => {
  const layer = document.createElement("div");
  layer.className = "card-layer title-card";
  const body = document.createElement("div");
  body.className = "card-body";
  const title = document.createElement("h1");
  title.className = "card-title";
  title.textContent = card.title;
  const rule = document.createElement("div");
  rule.className = "card-rule";
  body.append(title, rule);
  if (card.description !== undefined) {
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = card.description;
    body.append(description);
  }
  layer.append(body);
  if (onTitleCard(logo)) layer.append(logoImage(logo));
  frame.append(layer);

  const target = cardTarget("title");
  return (state) => {
    const opacity = state[target]?.opacity ?? 1;
    layer.style.visibility = opacity > 0 ? "visible" : "hidden";
    layer.style.opacity = opacity.toFixed(3);
  };
};

/** A logo shown on every frame: a layer above the scenes and the cards. */
export const renderLogoLayer = (frame: HTMLElement, logo: LogoDrawing): void => {
  const layer = document.createElement("div");
  layer.className = "logo-layer";
  layer.append(logoImage(logo));
  frame.append(layer);
};
