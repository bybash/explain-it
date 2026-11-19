import type { Validated } from "../../schema/errors.ts";
import { fail, ok } from "../../schema/result.ts";

/** One font file, relative to `assets/fonts/`, and the weights it covers ("100 900" when variable). */
export type FontFile = { readonly file: string; readonly weight: string };

export type BundledFont = {
  readonly id: string;
  /** The CSS font family name. */
  readonly family: string;
  readonly files: readonly FontFile[];
};

const variable = (id: string, family: string): BundledFont => ({
  id,
  family,
  files: [{ file: `${id}/${id}-latin-wght-normal.woff2`, weight: "100 900" }],
});

/**
 * The fonts that ship with explAIn-it: Latin subsets in woff2, each under the
 * SIL Open Font License, with its licence next to it in `assets/fonts/<id>/`.
 * Bundled rather than fetched, so a render never depends on the network.
 */
export const FONTS: readonly BundledFont[] = [
  variable("inter", "Inter"),
  {
    id: "barlow",
    family: "Barlow",
    files: [400, 500, 600, 700].map((weight) => ({
      file: `barlow/barlow-latin-${weight}-normal.woff2`,
      weight: String(weight),
    })),
  },
  variable("dm-sans", "DM Sans"),
  variable("ibm-plex-sans", "IBM Plex Sans"),
  variable("manrope", "Manrope"),
  variable("nunito-sans", "Nunito Sans"),
  variable("plus-jakarta-sans", "Plus Jakarta Sans"),
  variable("space-grotesk", "Space Grotesk"),
];

/** Looks up a bundled font by the id in `config.font`. Uploaded fonts arrive with slice 3.7. */
export const fontFor = (id: string): Validated<BundledFont> => {
  const font = FONTS.find((f) => f.id === id);
  if (font) return ok(font);
  return fail([
    {
      path: "font",
      message: `unknown font "${id}"; bundled fonts are ${FONTS.map((f) => f.id).join(", ")}`,
    },
  ]);
};
