import { describe, expect, it } from "vitest";
import type { BeatWarning } from "../schema/checks.ts";
import { sheetHtml, sheetLayout } from "./sheet.ts";

const beats = Array.from({ length: 10 }, (_, i) => ({
  id: `beat_${i + 1}`,
  scene: i < 5 ? "sign_in" : "exchange",
  start: i * 4,
  end: i * 4 + 4,
}));
const overlap = (beat: string): BeatWarning => ({
  check: "overlap",
  scene: "sign_in",
  beat,
  at: 1,
  px: 9,
  message: "a and b overlap",
});

describe("sheetLayout", () => {
  it("puts one tile per beat, in order, four to a row", () => {
    const sheet = sheetLayout({ beats, warnings: [], tileWidth: 480 });
    expect(sheet.tiles).toHaveLength(10);
    expect(sheet.tiles.map((t) => [t.column, t.row])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(sheet.columns).toBe(4);
    expect(sheet.rows).toBe(3);
  });

  it("labels each tile with its number, scene, beat and the moment shown", () => {
    const [first, , third] = sheetLayout({ beats, warnings: [], tileWidth: 480 }).tiles;
    expect(first).toMatchObject({ label: "1 · sign_in/beat_1 · 2.0 s", at: 2 });
    expect(third?.label).toBe("3 · sign_in/beat_3 · 10.0 s");
  });

  it("marks the beats with warnings, with how many", () => {
    const sheet = sheetLayout({
      beats,
      warnings: [overlap("beat_2"), overlap("beat_2"), overlap("beat_7")],
      tileWidth: 480,
    });
    expect(sheet.tiles.map((t) => t.warnings)).toEqual([0, 2, 0, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("keeps the stage's shape in every tile, at any width", () => {
    for (const tileWidth of [480, 300]) {
      const { tile } = sheetLayout({ beats, warnings: [], tileWidth });
      expect(tile.width / tile.height).toBeCloseTo(16 / 9);
    }
  });
});

describe("sheetHtml", () => {
  it("lays out each still with its label, and marks the tiles with warnings", () => {
    const sheet = sheetLayout({
      beats: beats.slice(0, 2),
      warnings: [overlap("beat_2")],
      tileWidth: 480,
    });
    const html = sheetHtml(sheet, ["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(html).toContain("1 · sign_in/beat_1 · 2.0 s");
    expect(html).toContain('class="tile warned"');
    expect(html).toContain("1 warning");
    expect(html).toContain(`width: ${sheet.width}px`);
  });

  it("escapes what it writes into the page", () => {
    const sheet = sheetLayout({ beats: beats.slice(0, 1), warnings: [], tileWidth: 480 });
    expect(sheetHtml(sheet, ['x" onerror="alert(1)'])).not.toContain('" onerror="');
  });
});
