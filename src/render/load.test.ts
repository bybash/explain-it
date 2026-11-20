import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { loadProject } from "./load.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const temps: string[] = [];
const copyOfExample = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "explain-it-load-"));
  temps.push(dir);
  cpSync(example, dir, { recursive: true });
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const errorsOf = async (dir: string) => {
  const result = await loadProject(dir);
  return result.ok ? [] : formatErrors(result.errors);
};

describe("loadProject", () => {
  it("reads and validates the example", async () => {
    const result = await loadProject(example);
    if (!result.ok) throw new Error(formatErrors(result.errors).join("\n"));
    expect(result.value.graph.title).toBeTruthy();
    expect(result.value.storyboard.scenes.map((s) => s.id)).toEqual(["sign_in", "exchange"]);
    expect(result.value.config.theme.mode).toBe("both");
    expect(Object.keys(result.value.layout.positions)).toContain("user");
  });

  it("names the file and the field of each problem", async () => {
    const dir = copyOfExample();
    writeFileSync(join(dir, "storyboard.json"), JSON.stringify({ version: 1, scenes: [] }));
    expect(await errorsOf(dir)).toEqual(["storyboard.json: scenes: 0 items, min 1"]);
  });

  it("says which file is missing or is not JSON", async () => {
    const dir = copyOfExample();
    unlinkSync(join(dir, "layout.json"));
    writeFileSync(join(dir, "storyboard.json"), "{ nope");
    const errors = await errorsOf(dir);
    expect(errors).toContain("layout.json: missing; run `npm run layout -- <project>`");
    expect(errors.some((e) => e.startsWith("storyboard.json: not valid JSON"))).toBe(true);
  });

  it("uses the default config when the project has none", async () => {
    const dir = copyOfExample();
    unlinkSync(join(dir, "config.json"));
    const result = await loadProject(dir);
    expect(result.ok && result.value.config.theme.mode).toBe("light");
  });

  it("does not check the storyboard and layout against a broken graph", async () => {
    const dir = copyOfExample();
    writeFileSync(join(dir, "graph.json"), JSON.stringify({ version: 1 }));
    const errors = await errorsOf(dir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith("graph.json: "))).toBe(true);
  });

  describe("the logo", () => {
    const SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const withLogo = (logo: object, files: Record<string, string | Buffer>) => {
      const dir = copyOfExample();
      const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
      writeFileSync(join(dir, "config.json"), JSON.stringify({ ...config, logo }));
      mkdirSync(join(dir, "assets"), { recursive: true });
      for (const [name, data] of Object.entries(files))
        writeFileSync(join(dir, "assets", name), data);
      return dir;
    };

    it("reads the logo from assets/, and one file serves both modes", async () => {
      const dir = withLogo({ light: "mark.svg" }, { "mark.svg": SVG });
      const result = await loadProject(dir);
      if (!result.ok) throw new Error(formatErrors(result.errors).join("\n"));
      const url = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;
      expect(result.value.logo).toEqual({ light: url, dark: url });
    });

    it("keeps a light and a dark file apart, and types each by its name", async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const dir = withLogo({ light: "a.svg", dark: "b.png" }, { "a.svg": SVG, "b.png": png });
      const result = await loadProject(dir);
      expect(result.ok && result.value.logo?.dark).toBe(
        `data:image/png;base64,${png.toString("base64")}`,
      );
    });

    it("has no logo when the config has none", async () => {
      const dir = copyOfExample();
      const { logo: _, ...config } = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
      writeFileSync(join(dir, "config.json"), JSON.stringify(config));
      const result = await loadProject(dir);
      expect(result.ok && result.value.logo).toBeUndefined();
    });

    it("names the field of a missing or oversized file", async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1);
      const dir = withLogo({ light: "gone.svg", dark: "big.png" }, { "big.png": big });
      expect(await errorsOf(dir)).toEqual([
        "config.json: logo.light: assets/gone.svg missing",
        "config.json: logo.dark: assets/big.png is 2.1 MB, max 2 MB",
      ]);
    });

    it("names the field of a file that is not the image its name says, or not a file", async () => {
      const dir = withLogo({ light: "mark.png", dark: "folder.svg" }, { "mark.png": SVG });
      mkdirSync(join(dir, "assets", "folder.svg"));
      expect(await errorsOf(dir)).toEqual([
        "config.json: logo.light: assets/mark.png is not a PNG image",
        "config.json: logo.dark: assets/folder.svg is not a file",
      ]);
    });

    it("reads a self-closing SVG after an XML declaration", async () => {
      const svg = '<?xml version="1.0"?>\n<svg/>';
      const dir = withLogo({ light: "mark.svg" }, { "mark.svg": svg });
      const result = await loadProject(dir);
      expect(result.ok).toBe(true);
    });

    it("names the field of a file it may not read", async () => {
      const dir = withLogo({ light: "locked.svg" }, { "locked.svg": SVG });
      chmodSync(join(dir, "assets", "locked.svg"), 0o000);
      expect(await errorsOf(dir)).toEqual([
        "config.json: logo.light: assets/locked.svg could not be read (EACCES)",
      ]);
    });
  });
});
