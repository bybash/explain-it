import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { importLogo } from "./logo.ts";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let dir: string;
let project: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-logo-"));
  project = join(dir, "project");
  mkdirSync(project);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const errorsOf = async (...args: Parameters<typeof importLogo>) => {
  const result = await importLogo(...args);
  return result.ok ? [] : formatErrors(result.errors);
};

describe("importLogo", () => {
  it("copies a logo file from an absolute path into the project's assets/", async () => {
    const source = join(dir, "brand.svg");
    writeFileSync(source, SVG);
    expect(await importLogo(project, "light", { path: source })).toEqual({
      ok: true,
      value: "logo-light.svg",
    });
    expect(readFileSync(join(project, "assets", "logo-light.svg"), "utf8")).toBe(SVG);
  });

  it("writes a logo given as a data URL, named by its type", async () => {
    const dataUrl = `data:image/png;base64,${PNG.toString("base64")}`;
    expect(await importLogo(project, "dark", { dataUrl })).toEqual({
      ok: true,
      value: "logo-dark.png",
    });
    expect(readFileSync(join(project, "assets", "logo-dark.png"))).toEqual(PNG);
  });

  it("names what is wrong with a path", async () => {
    expect(await errorsOf(project, "light", { path: "brand.svg" })).toEqual([
      "logo.light.path: must be an absolute path",
    ]);
    expect(await errorsOf(project, "light", { path: join(dir, "gone.svg") })).toEqual([
      `logo.light.path: ${join(dir, "gone.svg")} missing`,
    ]);
    const gif = join(dir, "brand.gif");
    writeFileSync(gif, "GIF89a");
    expect(await errorsOf(project, "light", { path: gif })).toEqual([
      "logo.light.path: must end in .png, .jpg, .jpeg or .svg",
    ]);
    const fake = join(dir, "fake.png");
    writeFileSync(fake, SVG);
    expect(await errorsOf(project, "light", { path: fake })).toEqual([
      `logo.light.path: ${fake} is not a PNG image`,
    ]);
  });

  it("names what is wrong with a data URL", async () => {
    expect(await errorsOf(project, "dark", { dataUrl: "data:text/html;base64,PGI+" })).toEqual([
      "logo.dark.dataUrl: must be a base64 data URL of image/png, image/jpeg or image/svg+xml",
    ]);
    const big = `data:image/svg+xml;base64,${Buffer.alloc(2 * 1024 * 1024 + 1, 32).toString("base64")}`;
    expect(await errorsOf(project, "dark", { dataUrl: big })).toEqual([
      "logo.dark.dataUrl: is 2.1 MB, max 2 MB",
    ]);
  });
});
