import jsqr from "jsqr";
import { describe, expect, it } from "vitest";
import { QR_QUIET, qrModules, qrPath, qrPixels } from "./qr.ts";

/** Draws the modules as black squares on white, with the 4-module quiet zone a reader needs. */
const pixels = (modules: readonly (readonly boolean[])[], scale = 4) => {
  const quiet = 4;
  const size = (modules.length + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const [row, line] of modules.entries())
    for (const [col, dark] of line.entries())
      if (dark)
        for (let y = 0; y < scale; y++)
          for (let x = 0; x < scale; x++) {
            const i = (((row + quiet) * scale + y) * size + (col + quiet) * scale + x) * 4;
            data.fill(0, i, i + 3);
          }
  return { data, size };
};

/** The modules a path from qrPath covers: each `M x y h n v 1 h -n z` run fills n modules of row y. */
const covered = (path: string, size: number) => {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, n] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g))
    for (let i = 0; i < Number(n); i++) {
      const row = grid[Number(y)];
      if (row) row[Number(x) + i] = true;
    }
  return grid;
};

describe("qrModules", () => {
  it("encodes a link that a QR reader reads back", () => {
    for (const link of [
      "https://example.com",
      "https://example.com/docs/oauth?from=video#sign-in",
      "https://example.com/über/straße",
      `https://example.com/${"long-path/".repeat(18)}`,
    ]) {
      const modules = qrModules(link);
      const { data, size } = pixels(modules);
      // jsqr is CommonJS; under NodeNext its function is `.default`.
      expect(jsqr.default(data, size, size)?.data).toBe(link);
    }
  });

  it("is square, and the same for the same link", () => {
    const modules = qrModules("https://example.com");
    expect(modules.every((row) => row.length === modules.length)).toBe(true);
    expect(qrModules("https://example.com")).toEqual(modules);
  });
});

describe("qrPixels", () => {
  it("keeps every module at least 4 px at 720p, even for the longest link", () => {
    const longest = `https://example.com/${"x".repeat(200 - 20)}`;
    for (const link of ["https://example.com", longest]) {
      const modules = qrModules(link);
      const perModuleAt720p =
        (qrPixels(modules.length) / (modules.length + 2 * QR_QUIET)) * (2 / 3);
      expect(perModuleAt720p).toBeGreaterThanOrEqual(4);
      // And the code reads back when drawn that small.
      const { data, size } = pixels(modules, Math.floor(perModuleAt720p));
      expect(jsqr.default(data, size, size)?.data).toBe(link);
    }
  });
});

describe("qrPath", () => {
  it("covers exactly the dark modules, one unit per module", () => {
    const modules = qrModules("https://example.com/docs");
    expect(covered(qrPath(modules), modules.length)).toEqual(modules);
  });
});
