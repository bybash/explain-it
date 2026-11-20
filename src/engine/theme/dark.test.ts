import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CATEGORY_COLOURS } from "../../schema/config.ts";
import { contrast, luminance } from "./colour.ts";
import { darkVariant, MIN_CONTRAST, type PaletteColours } from "./dark.ts";

const hex = fc
  .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
  .map((rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`);

const palette: fc.Arbitrary<PaletteColours> = fc.record({
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  accent: hex,
  categories: fc.array(hex, { maxLength: MAX_CATEGORY_COLOURS }),
});

const light: PaletteColours = {
  background: "#f6f7fb",
  surface: "#ffffff",
  text: "#18181b",
  muted: "#71717a",
  accent: "#6d28d9",
  categories: ["#2563eb", "#0f766e", "#b45309"],
};

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 is the lightest grey that passes 4.5:1 on white.
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("darkVariant", () => {
  it("keeps one colour per category, in order", () => {
    expect(darkVariant(light).categories).toHaveLength(light.categories.length);
  });

  it("gives every colour as a hex colour", () => {
    fc.assert(
      fc.property(palette, (p) => {
        const { categories, ...rest } = darkVariant(p);
        for (const colour of [...Object.values(rest), ...categories])
          expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      }),
    );
  });

  it("is dark, with readable text and visible accents, whatever the light palette", () => {
    fc.assert(
      fc.property(palette, (p) => {
        const dark = darkVariant(p);
        expect(luminance(dark.background)).toBeLessThan(0.03);
        expect(contrast(dark.text, dark.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
        expect(contrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(dark.muted, dark.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.muted);
        for (const colour of [dark.accent, ...dark.categories])
          expect(contrast(colour, dark.background)).toBeGreaterThanOrEqual(MIN_CONTRAST.accent);
      }),
    );
  });

  it("keeps the hue of the accent", () => {
    // A violet accent stays violet: blue well above green.
    const accent = darkVariant(light).accent;
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(accent.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan((g ?? 0) + 60);
    expect(r).toBeGreaterThan(g ?? 0);
  });
});
