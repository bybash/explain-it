import type { Logo } from "../../schema/config.ts";

/** Where a logo can be drawn: on a card, or on its own layer over every frame. */
export type LogoPlace = "title" | "end" | "frames";

const PLACES: Readonly<Record<Logo["show"], readonly LogoPlace[]>> = {
  start: ["title"],
  end: ["end"],
  both: ["title", "end"],
  all: ["frames"],
};

/** Where a card's logo goes: the title card closing the video stands in for the end card. */
export const logoPlaceOf = (card: "title" | "title-again" | "end"): LogoPlace =>
  card === "title" ? "title" : "end";

/** Whether `show` puts the logo in `place` (SPEC, Logo). A logo on every frame is not drawn again on a card. */
export const logoShowsOn = (show: Logo["show"], place: LogoPlace): boolean =>
  PLACES[show].includes(place);
