import type { CustomPalette } from "../../schema/config.ts";
import { contrast, hexOfHsl, hslOf } from "./colour.ts";

/** The colours of one mode of a palette. */
export type PaletteColours = Omit<CustomPalette, "dark">;

/** Contrast the generated dark palette guarantees against its background. */
export const MIN_CONTRAST = { text: 7, muted: 4.5, accent: 3 } as const;

/** The hue of `hex` at a fixed lightness, with its saturation capped. */
const toned = (hex: string, l: number, maxSaturation = 1): string => {
  const { h, s } = hslOf(hex);
  return hexOfHsl({ h, s: Math.min(s, maxSaturation), l });
};

/** Lightens `hex`, keeping its hue, until it reaches `ratio` against `background`. */
const readableOn = (hex: string, background: string, ratio: number, minLightness = 0): string => {
  const { h, s, l } = hslOf(hex);
  for (let lightness = Math.max(l, minLightness); lightness < 1; lightness += 0.02) {
    const candidate = hexOfHsl({ h, s, l: lightness });
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return "#ffffff";
};

/**
 * A dark palette from a light one, for custom palettes that do not give their
 * own. The background and surfaces take a muted tint of the accent's hue;
 * text, muted text, the accent and the categories keep their hues and are
 * lightened until they read on the background.
 */
export const darkVariant = (light: PaletteColours): PaletteColours => {
  const background = toned(light.accent, 0.09, 0.35);
  const vivid = (hex: string) => readableOn(hex, background, MIN_CONTRAST.accent, 0.62);
  return {
    background,
    surface: toned(light.accent, 0.17, 0.3),
    text: readableOn(toned(light.text, 0.94, 0.15), background, MIN_CONTRAST.text),
    muted: readableOn(toned(light.muted, 0.7, 0.2), background, MIN_CONTRAST.muted),
    accent: vivid(light.accent),
    categories: light.categories.map(vivid),
  };
};
