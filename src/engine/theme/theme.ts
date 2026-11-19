import { type CustomPalette, MAX_CATEGORY_COLOURS } from "../../schema/config.ts";
import type { Validated } from "../../schema/errors.ts";
import { fail, ok } from "../../schema/result.ts";
import { mix } from "./colour.ts";
import { darkVariant, type PaletteColours } from "./dark.ts";
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
const DARK_SHADE = { left: 0.35, right: 0.6, edge: -0.35 };

const tokensOf = (colours: PaletteColours, mode: ThemeMode): Tokens => {
  const { background, surface, text, muted, accent, categories } = colours;
  const categoryTokens = Object.fromEntries(
    Array.from({ length: MAX_CATEGORY_COLOURS }, (_, i) => [
      `--cat-c${i + 1}`,
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
          // In the dark a box's outline is lighter than its faces, catching the light.
          "--face-edge": mix(surface, text, -DARK_SHADE.edge),
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
  };
};

/** The colours and CSS tokens for a palette (a preset name or a custom palette) in one mode. */
export const themeFor = (palette: string | CustomPalette, mode: ThemeMode): Validated<Theme> => {
  const colours = coloursFor(palette, mode);
  if (!colours.ok) return colours;
  return ok({ mode, colours: colours.value, tokens: tokensOf(colours.value, mode) });
};
