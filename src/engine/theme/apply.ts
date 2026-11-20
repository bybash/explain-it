import type { BundledFont } from "./fonts.ts";
import type { Theme } from "./theme.ts";

/** Sets a theme's tokens and the font family on `root`, usually `document.documentElement`. */
export const applyTheme = (root: HTMLElement, theme: Theme, font: BundledFont): void => {
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
  root.style.setProperty("--font", JSON.stringify(font.family));
  root.dataset.mode = theme.mode;
};

/**
 * Loads every file of a bundled font from `base` (the URL of `assets/fonts/`)
 * and waits for them. Text is measured when the scene is drawn, so this must
 * finish first, or labels are fitted to the fallback font.
 */
export const loadFont = async (font: BundledFont, base: URL): Promise<void> => {
  const faces = font.files.map(
    ({ file, weight }) =>
      new FontFace(font.family, `url(${new URL(file, base).href}) format("woff2")`, { weight }),
  );
  for (const face of faces) document.fonts.add(face);
  await Promise.all(faces.map((face) => face.load()));
};
