import { CATEGORIES } from "../../schema/colours.ts";
import type { CustomPalette } from "../../schema/config.ts";
import type { Validated } from "../../schema/errors.ts";
import { ok } from "../../schema/result.ts";
import { themeFor } from "./theme.ts";

type Category = (typeof CATEGORIES)[number];

/** A category's colour in each mode. */
export type CategoryColour = { readonly light: string; readonly dark: string };

/**
 * What each category (accent, muted, c1 to c6) looks like in a palette, light
 * and dark, as the video draws it: so a person or an agent can pick one by
 * its colour (SPEC, Graph).
 */
export const categoryColours = (
  palette: string | CustomPalette,
): Validated<Readonly<Record<Category, CategoryColour>>> => {
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
    ) as Record<Category, CategoryColour>,
  );
};
