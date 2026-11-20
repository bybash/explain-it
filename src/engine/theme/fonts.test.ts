import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../schema/config.ts";
import { formatErrors } from "../../schema/errors.ts";
import { FONTS, fontFor } from "./fonts.ts";

const ASSETS = join(import.meta.dirname, "../../../assets/fonts");

describe("fontFor", () => {
  it("finds the default font", () => {
    const result = fontFor(DEFAULT_CONFIG.font);
    expect(result.ok && result.value.family).toBe("Inter");
  });

  it("names the field and the choices for an unknown font", () => {
    const result = fontFor("comic-sans");
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      `font: unknown font "comic-sans"; bundled fonts are ${FONTS.map((f) => f.id).join(", ")}`,
    ]);
  });
});

describe("bundled fonts", () => {
  it("ships about eight fonts", () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FONTS.map((font) => [font.id, font] as const))(
    "%s has its files and its OFL licence on disk",
    (_, font) => {
      expect(font.files.length).toBeGreaterThan(0);
      for (const { file } of font.files) {
        expect(existsSync(join(ASSETS, file)), file).toBe(true);
        const licence = join(ASSETS, dirname(file), "OFL.txt");
        expect(readFileSync(licence, "utf8")).toContain("SIL Open Font License, Version 1.1");
      }
    },
  );
});
