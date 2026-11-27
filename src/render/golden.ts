import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "playwright-core";
import { stillAt } from "../checks/sheet.ts";
import { formatErrors } from "../schema/errors.ts";
import { loadProject } from "./load.ts";
import { beatsOnPage, openPage } from "./render.ts";

/** The example projects, each with its golden stills (6.3, decision 046). */
export const EXAMPLES_DIR = resolve("examples");
export const GOLDEN_DIR = resolve("golden");
export const exampleNames = (): string[] =>
  readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** Stills are kept at this width: large enough to see a label or an arrowhead go, small enough to keep in the repository. */
export const GOLDEN_WIDTH = 960;
/**
 * How far a still may drift from its golden one: a pixel counts as changed
 * when a channel moves more than `channel` steps (anti-aliasing moves a few),
 * and a still fails when more than `share` of its pixels changed.
 */
export const GOLDEN_TOLERANCE = { channel: 32, share: 0.001 } as const;

/** One beat's still, named so the stills sort in the order they play. */
export type Still = { readonly name: string; readonly png: Buffer };

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
const pngOf = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

/**
 * Each beat of an example at the moment the checks look at it, light, as the
 * render page draws it, shrunk to `GOLDEN_WIDTH`. The narration is timed by
 * its words, so the stills need no voice.
 */
export const exampleStills = async (
  browser: Browser,
  pageUrl: string,
  name: string,
): Promise<Still[]> => {
  const project = await loadProject(join(EXAMPLES_DIR, name));
  if (!project.ok) throw new Error(`${name}:\n${formatErrors(project.errors).join("\n")}`);
  const page = await openPage(browser, pageUrl, { ...project.value, mode: "light" });
  const tools = await browser.newPage();
  try {
    const stills: Still[] = [];
    for (const [i, beat] of (await beatsOnPage(page)).entries()) {
      await page.evaluate(
        (t) => (window as unknown as { __seek: (t: number) => void }).__seek(t),
        stillAt(beat),
      );
      const full = await page.screenshot({ type: "png" });
      stills.push({
        name: `${String(i + 1).padStart(2, "0")}-${beat.id}`,
        png: await shrink(tools, full),
      });
    }
    return stills;
  } finally {
    await page.close();
    await tools.close();
  }
};

/** A still shrunk to `GOLDEN_WIDTH` by Chrome's own canvas, so no image library is needed. */
const shrink = async (tools: Page, png: Buffer): Promise<Buffer> =>
  pngOf(
    await tools.evaluate(
      async ({ src, width }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.round((image.height * width) / image.width);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d canvas");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      },
      { src: dataUrl(png), width: GOLDEN_WIDTH },
    ),
  );

/** How a still compares with its golden one, and an image of the difference: changed pixels in red over a faded golden. */
export type Comparison = {
  readonly changed: number;
  readonly total: number;
  readonly diff: Buffer;
};

export const compareStills = async (
  tools: Page,
  golden: Buffer,
  actual: Buffer,
): Promise<Comparison> => {
  const result = await tools.evaluate(
    async ({ a, b, channel }) => {
      const load = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      };
      const [first, second] = await Promise.all([load(a), load(b)]);
      const width = first.width;
      const height = first.height;
      const pixels = (image: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d canvas");
        context.drawImage(image, 0, 0, width, height);
        return { canvas, context, data: context.getImageData(0, 0, width, height) };
      };
      const before = pixels(first);
      const after = pixels(second);
      const sizeChanged = second.width !== width || second.height !== height;
      const out = before.context.createImageData(width, height);
      let changed = 0;
      for (let i = 0; i < before.data.data.length; i += 4) {
        let moved = sizeChanged;
        for (let c = 0; c < 3 && !moved; c++)
          moved =
            Math.abs((before.data.data[i + c] ?? 0) - (after.data.data[i + c] ?? 0)) > channel;
        if (moved) changed++;
        const grey = (before.data.data[i] ?? 0) * 0.3 + 170;
        out.data[i] = moved ? 230 : grey;
        out.data[i + 1] = moved ? 30 : grey;
        out.data[i + 2] = moved ? 30 : grey;
        out.data[i + 3] = 255;
      }
      before.context.putImageData(out, 0, 0);
      return { changed, total: width * height, diff: before.canvas.toDataURL("image/png") };
    },
    { a: dataUrl(golden), b: dataUrl(actual), channel: GOLDEN_TOLERANCE.channel },
  );
  return { changed: result.changed, total: result.total, diff: pngOf(result.diff) };
};
