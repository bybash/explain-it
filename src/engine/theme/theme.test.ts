import { describe, expect, it } from "vitest";
import {
  type CustomPalette,
  CustomPaletteSchema,
  DEFAULT_CONFIG,
  MAX_CATEGORY_COLOURS,
} from "../../schema/config.ts";
import { formatErrors } from "../../schema/errors.ts";
import { contrast, hslOf, luminance } from "./colour.ts";
import { MIN_CONTRAST } from "./dark.ts";
import { PALETTES, type ThemeMode } from "./palettes.ts";
import { type Theme, themeFor } from "./theme.ts";

const MODES: readonly ThemeMode[] = ["light", "dark"];

const themeOf = (palette: string | CustomPalette, mode: ThemeMode): Theme => {
  const result = themeFor(palette, mode);
  if (!result.ok) throw new Error(formatErrors(result.errors).join("\n"));
  return result.value;
};

const custom: CustomPalette = {
  background: "#ffffff",
  surface: "#f4f4f5",
  text: "#18181b",
  muted: "#71717a",
  accent: "#6d28d9",
  categories: ["#2563eb", "#16a34a"],
};

describe("themeFor: palettes", () => {
  it("uses the preset's own colours for each mode", () => {
    const preset = PALETTES.ocean;
    expect(themeOf("ocean", "light").colours).toEqual(preset?.light);
    expect(themeOf("ocean", "dark").colours).toEqual(preset?.dark);
  });

  it("takes a custom palette as it is in light mode", () => {
    const { dark: _, ...light } = custom;
    expect(themeOf(custom, "light").colours).toEqual(light);
  });

  it("uses a custom palette's own dark variant when it has one", () => {
    const dark = { ...custom, background: "#0b0b0f", text: "#fafafa" };
    const { dark: _, ...withoutDark } = dark;
    expect(themeOf({ ...custom, dark: withoutDark }, "dark").colours).toEqual(withoutDark);
  });

  it("generates the dark variant of a custom palette without one", () => {
    const dark = themeOf(custom, "dark").colours;
    expect(luminance(dark.background)).toBeLessThan(luminance(custom.background));
    expect(contrast(dark.text, dark.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
  });

  it("names the field and the presets for an unknown palette", () => {
    const result = themeFor("neon", "light");
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      `theme.palette: unknown palette "neon"; presets are ${Object.keys(PALETTES).join(", ")}`,
    ]);
  });

  it("knows the default palette", () => {
    expect(typeof DEFAULT_CONFIG.theme.palette).toBe("string");
    expect(themeFor(DEFAULT_CONFIG.theme.palette, "light").ok).toBe(true);
  });
});

describe("themeFor: tokens", () => {
  it("sets the five base colours as CSS custom properties", () => {
    const { tokens } = themeOf(custom, "light");
    expect(tokens).toMatchObject({
      "--bg": "#ffffff",
      "--surface": "#f4f4f5",
      "--text": "#18181b",
      "--muted": "#71717a",
      "--accent": "#6d28d9",
    });
  });

  it("names every category, repeating a short palette's colours in order", () => {
    const { tokens } = themeOf(custom, "light");
    expect(tokens["--cat-accent"]).toBe("#6d28d9");
    expect(tokens["--cat-muted"]).toBe("#71717a");
    expect(
      Array.from({ length: MAX_CATEGORY_COLOURS }, (_, i) => tokens[`--cat-c${i + 1}` as const]),
    ).toEqual(["#2563eb", "#16a34a", "#2563eb", "#16a34a", "#2563eb", "#16a34a"]);
  });

  it("falls back to the accent for categories when the palette has none", () => {
    const { tokens } = themeOf({ ...custom, categories: [] }, "light");
    expect(tokens["--cat-c1"]).toBe("#6d28d9");
  });

  it.each(MODES)("shades box faces from the top down in %s mode", (mode) => {
    const { tokens } = themeOf("default", mode);
    const [top, left, right] = (["--face-top", "--face-left", "--face-right"] as const).map(
      (name) => luminance(tokens[name] ?? ""),
    );
    expect(top).toBeGreaterThan(left ?? 0);
    expect(left).toBeGreaterThan(right ?? 0);
  });
});

describe("palette presets", () => {
  const cases = Object.entries(PALETTES).flatMap(([name, preset]) =>
    MODES.map((mode) => [name, mode, preset[mode]] as const),
  );

  it("ships about six presets", () => {
    expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.entries(PALETTES))("%s is a valid palette with a dark variant", (_, preset) => {
    expect(CustomPaletteSchema.safeParse({ ...preset.light, dark: preset.dark }).success).toBe(
      true,
    );
  });

  it.each(cases)("%s %s is readable", (_, __, colours) => {
    expect(colours.categories).toHaveLength(MAX_CATEGORY_COLOURS);
    expect(contrast(colours.text, colours.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
    expect(contrast(colours.text, colours.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
    expect(contrast(colours.muted, colours.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.muted);
    for (const colour of [colours.accent, ...colours.categories])
      expect(contrast(colour, colours.background), colour).toBeGreaterThanOrEqual(
        MIN_CONTRAST.accent,
      );
  });
});

describe("themeFor: badge tones", () => {
  const TONE_HUES = { ok: 145, warn: 38, error: 0 } as const;
  const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const themes = [
    ...Object.keys(PALETTES).flatMap((name) => MODES.map((mode) => [name, mode] as const)),
    ...MODES.map((mode) => ["custom", mode] as const),
  ].map(
    ([name, mode]) =>
      [`${name} ${mode}`, themeOf(name === "custom" ? custom : name, mode)] as const,
  );

  it("shows info badges in the accent", () => {
    const { tokens } = themeOf(custom, "light");
    expect(tokens["--tone-info"]).toBe(custom.accent);
  });

  it.each(themes)("%s: every tone reads on the background", (_, theme) => {
    for (const tone of ["info", "ok", "warn", "error"])
      expect(
        contrast(theme.tokens[`--tone-${tone}`] ?? "", theme.colours.background),
        tone,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST.accent);
  });

  it.each(themes)("%s: ok is green, warn amber, error red", (_, theme) => {
    for (const [tone, hue] of Object.entries(TONE_HUES))
      expect(hueDistance(hslOf(theme.tokens[`--tone-${tone}`] ?? "").h, hue), tone).toBeLessThan(
        15,
      );
  });

  it("darkens tones on a pale background and lightens them on a dark one", () => {
    const pale = themeOf(custom, "light").tokens["--tone-warn"] ?? "";
    const dark = themeOf(custom, "dark").tokens["--tone-warn"] ?? "";
    expect(luminance(pale)).toBeLessThan(luminance(dark));
  });
});
