import { describe, expect, it } from "vitest";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../schema/config.ts";
import { merged } from "../schema/merge-patch.ts";
import { previewLogo, styleEdit, withLogoFile } from "./style-form.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const SVG = "data:image/svg+xml;base64,PHN2Zy8+";
const config = (patch: object): Config => {
  const parsed = parseConfig(merged(DEFAULT_CONFIG, patch));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.value;
};

describe("styleEdit", () => {
  it("sends nothing when nothing changed", () => {
    expect(styleEdit(DEFAULT_CONFIG, DEFAULT_CONFIG, {})).toEqual({ config: {} });
  });

  it("sends only what changed, with null for what was taken out", () => {
    const saved = config({ cards: { end: { headline: "Try it", link: "https://a.example" } } });
    const draft = config({
      theme: { palette: "ocean" },
      cards: { end: { headline: "Try it" }, title: { title: "OAuth" } },
    });
    expect(styleEdit(saved, draft, {})).toEqual({
      config: {
        theme: { palette: "ocean" },
        cards: { end: { link: null }, title: { title: "OAuth" } },
      },
    });
  });

  it("sends a new logo file with the name the server will save it under", () => {
    const draft = withLogoFile(DEFAULT_CONFIG, "light", PNG);
    expect(draft.logo).toEqual({ light: "logo-light.png", corner: "top-right", show: "both" });
    expect(styleEdit(DEFAULT_CONFIG, draft, { light: PNG })).toEqual({
      config: { logo: { light: "logo-light.png", corner: "top-right", show: "both" } },
      logo: { light: { dataUrl: PNG } },
    });
  });

  it("takes the logo out with null", () => {
    const saved = config({ logo: { light: "logo-light.png" } });
    const { logo: _logo, ...withoutLogo } = saved;
    expect(styleEdit(saved, withoutLogo, {})).toEqual({
      config: { logo: null },
    });
  });
});

describe("previewLogo", () => {
  const saved = { light: PNG, dark: PNG };

  it("draws the saved logo while the draft keeps it", () => {
    const draft = config({ logo: { light: "logo-light.png" } });
    expect(previewLogo(draft, saved, {})).toEqual({ light: PNG, dark: PNG });
  });

  it("draws a file picked but not saved yet, and one file serves both modes", () => {
    const draft = withLogoFile(DEFAULT_CONFIG, "dark", SVG);
    expect(previewLogo(draft, null, { dark: SVG })).toEqual({ light: SVG, dark: SVG });
    const both = withLogoFile(config({ logo: { light: "logo-light.png" } }), "dark", SVG);
    expect(previewLogo(both, saved, { dark: SVG })).toEqual({ light: PNG, dark: SVG });
  });

  it("draws no logo once the draft takes it out", () => {
    expect(previewLogo(DEFAULT_CONFIG, saved, {})).toBeUndefined();
  });
});
