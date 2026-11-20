import type { CustomPalette } from "../../schema/config.ts";
import { BADGE_TONES } from "../../schema/storyboard.ts";
import { NUMBERED_CATEGORIES } from "./kinds.ts";

type BadgeTone = (typeof BADGE_TONES)[number];

import type { Validated } from "../../schema/errors.ts";
import { fail, ok } from "../../schema/result.ts";
import { contrast, hexOfHsl, luminance, mix } from "./colour.ts";
import { darkVariant, MIN_CONTRAST, type PaletteColours } from "./dark.ts";
import { PALETTES, type ThemeMode } from "./palettes.ts";

/** CSS custom properties, `--name` to value, set on the stage's root. */
export type Tokens = Readonly<Record<`--${string}`, string>>;

export type Theme = {
  readonly mode: ThemeMode;
  readonly colours: PaletteColours;
  readonly tokens: Tokens;
};

const coloursFor = (
  palette: string | CustomPalette,
  mode: ThemeMode,
): Validated<PaletteColours> => {
  if (typeof palette === "string") {
    const preset = PALETTES[palette];
    if (preset) return ok(preset[mode]);
    const names = Object.keys(PALETTES).join(", ");
    return fail([
      { path: "theme.palette", message: `unknown palette "${palette}"; presets are ${names}` },
    ]);
  }
  const { dark, ...light } = palette;
  if (mode === "light") return ok(light);
  return ok(dark ?? darkVariant(light));
};

/**
 * How much the side faces of a box move towards shadow: the left face a
 * little, the right face more. Light themes shade towards the text colour,
 * dark themes towards the background.
 */
const SHADE = { left: 0.08, right: 0.16, edge: 0.24 };
const DARK_SHADE = { left: 0.35, right: 0.6 };
/** In the dark a box's outline is lighter than its faces, catching the light. */
const DARK_EDGE_LIGHT = 0.35;

/**
 * Badge tones other than info (which is the accent) keep fixed hues in every
 * palette, so a green badge always means ok. Their lightness moves away from
 * the background until they reach the accent's contrast.
 */
const TONES: Readonly<
  Record<Exclude<BadgeTone, "info">, { readonly h: number; readonly s: number }>
> = {
  ok: { h: 145, s: 0.65 },
  warn: { h: 38, s: 0.9 },
  error: { h: 0, s: 0.75 },
};
const TONE_LIGHTNESS = { light: 0.42, dark: 0.62 } as const;
/** Below this luminance a background counts as dark, so tones are lightened on it. */
const DARK_BACKGROUND = 0.18;

const toneColourOn = (tone: keyof typeof TONES, background: string, mode: ThemeMode): string => {
  const { h, s } = TONES[tone];
  const step = luminance(background) < DARK_BACKGROUND ? 0.02 : -0.02;
  for (let l = TONE_LIGHTNESS[mode]; l > 0 && l < 1; l += step) {
    const candidate = hexOfHsl({ h, s, l });
    if (contrast(candidate, background) >= MIN_CONTRAST.accent) return candidate;
  }
  return step > 0 ? "#ffffff" : "#000000";
};

const tokensOf = (colours: PaletteColours, mode: ThemeMode): Tokens => {
  const { background, surface, text, muted, accent, categories } = colours;
  const categoryTokens = Object.fromEntries(
    NUMBERED_CATEGORIES.map((name, i) => [
      `--cat-${name}`,
      categories[i % Math.max(1, categories.length)] ?? accent,
    ]),
  );
  const faces =
    mode === "light"
      ? {
          "--face-left": mix(surface, text, SHADE.left),
          "--face-right": mix(surface, text, SHADE.right),
          "--face-edge": mix(surface, text, SHADE.edge),
        }
      : {
          "--face-left": mix(surface, background, DARK_SHADE.left),
          "--face-right": mix(surface, background, DARK_SHADE.right),
          "--face-edge": mix(surface, text, DARK_EDGE_LIGHT),
        };
  return {
    "--bg": background,
    "--surface": surface,
    "--text": text,
    "--muted": muted,
    "--accent": accent,
    "--face-top": surface,
    ...faces,
    "--dot": mix(background, muted, mode === "light" ? 0.7 : 0.5),
    "--cat-accent": accent,
    "--cat-muted": muted,
    ...categoryTokens,
    ...Object.fromEntries(
      BADGE_TONES.map((tone) => [
        `--tone-${tone}`,
        tone === "info" ? accent : toneColourOn(tone, background, mode),
      ]),
    ),
  };
};

/** The colours and CSS tokens for a palette (a preset name or a custom palette) in one mode. */
export const themeFor = (palette: string | CustomPalette, mode: ThemeMode): Validated<Theme> => {
  const colours = coloursFor(palette, mode);
  if (!colours.ok) return colours;
  return ok({ mode, colours: colours.value, tokens: tokensOf(colours.value, mode) });
};
