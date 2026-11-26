import { CATEGORIES, type CategoryColour, type ColourTable } from "../../schema/colours.ts";
import { type Config, type CustomPalette, DEFAULT_CONFIG } from "../../schema/config.ts";
import type { Validated } from "../../schema/errors.ts";
import { ok } from "../../schema/result.ts";
import { themeFor } from "./theme.ts";

/**
 * What each category (accent, muted, c1 to c6) looks like in a palette, light
 * and dark, as the video draws it: so a person or an agent can pick one by
 * its colour (SPEC, Graph).
 */
export const categoryColours = (palette: string | CustomPalette): Validated<ColourTable> => {
  const light = themeFor(palette, "light");
  if (!light.ok) return light;
  const dark = themeFor(palette, "dark");
  if (!dark.ok) return dark;
  return ok(
    Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        {
          light: light.value.tokens[`--cat-${category}`] ?? light.value.colours.accent,
          dark: dark.value.tokens[`--cat-${category}`] ?? dark.value.colours.accent,
        },
      ]),
    ) as Record<string, CategoryColour>,
  );
};

/** What each category looks like in a project's palette; null when its palette cannot be read. */
export const coloursOf = (config: Config | null): ColourTable | null => {
  const colours = categoryColours((config ?? DEFAULT_CONFIG).theme.palette);
  return colours.ok ? colours.value : null;
};
