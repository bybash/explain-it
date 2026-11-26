import { describe, expect, it } from "vitest";
import { formatErrors } from "../../schema/errors.ts";
import { categoryColours } from "./categories.ts";

describe("categoryColours", () => {
  it("gives each category's colour in light and dark, as the default palette draws it", () => {
    const colours = categoryColours("default");
    expect(colours.ok && colours.value).toEqual({
      accent: { light: "#6d28d9", dark: "#a78bfa" },
      muted: { light: "#5f6472", dark: "#a3a9bc" },
      c1: { light: "#2563eb", dark: "#60a5fa" },
      c2: { light: "#0f766e", dark: "#2dd4bf" },
      c3: { light: "#b45309", dark: "#fbbf24" },
      c4: { light: "#be185d", dark: "#f472b6" },
      c5: { light: "#0369a1", dark: "#38bdf8" },
      c6: { light: "#4d7c0f", dark: "#a3e635" },
    });
  });

  it("repeats a custom palette's colours in order when it has fewer than six", () => {
    const light = {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#000000",
      muted: "#444444",
      accent: "#333333",
      categories: ["#111111", "#222222"],
    };
    const colours = categoryColours({ ...light, dark: { ...light, categories: ["#aaaaaa"] } });
    expect(colours.ok && colours.value.c3).toEqual({ light: "#111111", dark: "#aaaaaa" });
    expect(colours.ok && colours.value.c4).toEqual({ light: "#222222", dark: "#aaaaaa" });
  });

  it("names an unknown palette", () => {
    const colours = categoryColours("nope");
    expect(colours.ok ? [] : formatErrors(colours.errors)[0]).toMatch(
      /^theme\.palette: unknown palette "nope"/,
    );
  });
});
