import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "./config.ts";
import { formatErrors } from "./errors.ts";
import { VOICE_IDS } from "./voices.ts";

const errorsFor = (data: unknown) => {
  const result = parseConfig(data);
  if (result.ok) throw new Error("expected errors");
  return formatErrors(result.errors);
};

describe("parseConfig", () => {
  it("fills every default from an empty object", () => {
    expect(parseConfig({})).toEqual({ ok: true, value: DEFAULT_CONFIG });
  });

  it("fills defaults inside a partial section", () => {
    const result = parseConfig({ voice: { id: "bm_george" } });
    expect(result.ok && result.value.voice).toEqual({ ...DEFAULT_CONFIG.voice, id: "bm_george" });
  });

  it("takes only a Kokoro voice, and names the ones there are", () => {
    expect(errorsFor({ voice: { id: "af_nobody" } })).toEqual([
      `voice.id: must be one of ${VOICE_IDS.map((id) => JSON.stringify(id)).join(", ")}`,
    ]);
    expect(VOICE_IDS).toContain("af_heart");
    expect(VOICE_IDS).toHaveLength(28);
  });

  it("accepts a custom palette", () => {
    const palette = {
      background: "#ffffff",
      surface: "#f4f4f5",
      text: "#18181b",
      muted: "#71717a",
      accent: "#6d28d9",
      categories: ["#2563eb", "#16a34a"],
    };
    const result = parseConfig({ theme: { palette } });
    expect(result.ok && result.value.theme.palette).toEqual(palette);
  });

  it("requires hex colours", () => {
    expect(
      errorsFor({
        theme: {
          palette: {
            background: "white",
            surface: "#f4f4f5",
            text: "#18181b",
            muted: "#71717a",
            accent: "#6d28d9",
            categories: [],
          },
        },
      }),
    ).toEqual(["theme.palette.background: must be a hex colour like #1a2b3c"]);
  });

  it("allows at most 6 category colours", () => {
    const palette = {
      background: "#ffffff",
      surface: "#f4f4f5",
      text: "#18181b",
      muted: "#71717a",
      accent: "#6d28d9",
      categories: Array.from({ length: 7 }, () => "#000000"),
    };
    expect(errorsFor({ theme: { palette } })).toEqual(["theme.palette.categories: 7 items, max 6"]);
  });

  it("takes a title card with an optional description, and no cards by default", () => {
    expect(DEFAULT_CONFIG.cards).toBeUndefined();
    const result = parseConfig({ cards: { title: { title: "Signing in with OAuth" } } });
    expect(result.ok && result.value.cards).toEqual({ title: { title: "Signing in with OAuth" } });
  });

  it("limits a title card to 100 characters of title and 160 of description", () => {
    expect(
      errorsFor({
        cards: { title: { title: "t".repeat(101), description: "d".repeat(161) } },
      }),
    ).toEqual([
      "cards.title.title: 101 characters, max 100",
      "cards.title.description: 161 characters, max 160",
    ]);
    expect(errorsFor({ cards: { title: { title: "" } } })).toEqual([
      "cards.title.title: must not be empty",
    ]);
  });

  it("takes an end card with a headline and optional link, where and credit", () => {
    const end = {
      headline: "Try it in your own app",
      link: "https://example.com/docs/oauth",
      where: "Settings › Sign-in",
      credit: "Made by the Identity team",
    };
    const result = parseConfig({ cards: { end } });
    expect(result.ok && result.value.cards).toEqual({ end });
  });

  it("limits the end card's lines and takes only an http(s) link", () => {
    expect(
      errorsFor({
        cards: {
          end: {
            headline: "h".repeat(101),
            link: `https://example.com/${"p".repeat(190)}`,
            where: "w".repeat(81),
            credit: "c".repeat(81),
          },
        },
      }),
    ).toEqual([
      "cards.end.headline: 101 characters, max 100",
      "cards.end.link: 210 characters, max 200",
      "cards.end.where: 81 characters, max 80",
      "cards.end.credit: 81 characters, max 80",
    ]);
    expect(errorsFor({ cards: { end: { headline: "Hi", link: "ftp://example.com" } } })).toEqual([
      "cards.end.link: must be an http or https URL",
    ]);
    expect(
      errorsFor({ cards: { end: { headline: "Hi", link: "https://exa\u0000mple.com" } } }),
    ).toEqual(["cards.end.link: must be an http or https URL"]);
    expect(errorsFor({ cards: { end: { link: "https://example.com" } } })).toEqual([
      "cards.end.headline: required",
    ]);
  });

  it("takes a logo in the top-right corner of both cards by default, and none by default", () => {
    expect(DEFAULT_CONFIG.logo).toBeUndefined();
    const result = parseConfig({ logo: { light: "logo.svg" } });
    expect(result.ok && result.value.logo).toEqual({
      light: "logo.svg",
      corner: "top-right",
      show: "both",
    });
  });

  it("needs at least one logo file, named in assets/ as a PNG, JPG or SVG", () => {
    expect(errorsFor({ logo: { corner: "bottom-right" } })).toEqual([
      "logo: needs a light or a dark file",
    ]);
    expect(
      errorsFor({ logo: { light: "../secret.svg", dark: "logo.gif", show: "never" } }),
    ).toEqual([
      "logo.light: must be a file name in assets/ ending in .png, .jpg, .jpeg or .svg",
      "logo.dark: must be a file name in assets/ ending in .png, .jpg, .jpeg or .svg",
      'logo.show: must be one of "start", "end", "both", "all"',
    ]);
  });

  it("bounds voice speed and music volume", () => {
    expect(errorsFor({ voice: { speed: 3 }, music: { volumeDb: 6 } })).toEqual([
      "voice.speed: must be at most 2",
      "music.volumeDb: must be at most 0",
    ]);
  });
});
