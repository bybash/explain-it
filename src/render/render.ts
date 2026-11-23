import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { z } from "zod";
import { stillAt } from "../checks/sheet.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import type { InjectedProject } from "../engine/page/render.ts";
import type { ThemeMode } from "../engine/theme/palettes.ts";
import { type BeatSpan, BeatSpanSchema, STAGE } from "../schema/checks.ts";
import type { Resolution } from "../schema/config.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import {
  RENDER_FILES,
  type RenderedTheme,
  type RenderProgress,
  type RenderStep,
} from "../schema/render.ts";
import { encodeArgs, posterArgs } from "./encode.ts";
import { pipeFrames } from "./ffmpeg.ts";
import { FPS, frameTimes, posterTime } from "./frames.ts";
import type { ProjectFiles } from "./load.ts";
import { captureInOrder } from "./parallel.ts";
import { drawSheet } from "./sheet.ts";
import { type SrtCue, toSrt } from "./srt.ts";

/** What to render: one video per theme, at one resolution. */
export type RenderSettings = {
  readonly themes: readonly ThemeMode[];
  readonly resolution: Resolution;
};

/** How a caller follows and stops a render. */
export type RenderControl = {
  /** Called at every hundredth of each theme's frames. */
  readonly onProgress?: (progress: RenderProgress) => void;
  /** Called as the render moves on: the voice, the mix, each theme's frames, then its files. */
  readonly onStep?: (step: RenderStep) => void;
  /** Stops the render at its next step: a frame, a theme, the poster. */
  readonly signal?: AbortSignal;
};

export type RenderOptions = RenderControl & {
  readonly project: ProjectFiles;
  readonly settings: RenderSettings;
  /** Each theme's files go in a folder of its own name here. */
  readonly outDir: string;
  /** The served render page (see `page.ts`). */
  readonly pageUrl: string;
  /** How many pages capture frames at once; 4 by default (SPEC, Rendering). */
  readonly pages?: number;
  /** The mastered soundtrack, muxed into both videos and copied beside them; none for a silent video. */
  readonly audio?: string;
};

const PAGES = 4;

/** What the render page exposes once it is ready. */
type Seekable = {
  __seek: (t: number) => void;
  __duration: number;
  __cues: SrtCue[];
  __captions: (show: boolean) => void;
};

/**
 * Rasterize every frame in full, in software. With partial or GPU raster,
 * Chrome's anti-aliasing depends on what it painted before and on how busy
 * it is, so the same frame came out differently on parallel pages.
 */
const DETERMINISTIC_RASTER = ["--disable-partial-raster", "--disable-gpu-rasterization"];

/** Chrome by default; `CHROME_PATH` points at another Chromium, as in Docker. */
export const launchBrowser = (): Promise<Browser> =>
  chromium.launch({
    args: DETERMINISTIC_RASTER,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: "chrome" }),
  });

/**
 * Renders a project once per theme: several render pages, each in a browser
 * of its own, seek every frame at 30 fps between them; the frames are piped
 * into ffmpeg in order, which writes `video.mp4`, then `captions.srt` and
 * `poster.png` go into `<outDir>/<theme>/`. A missing Chrome or ffmpeg, or a
 * page that fails, is a broken environment, so it throws.
 */
export const renderProject = async (options: RenderOptions): Promise<RenderedTheme[]> => {
  // A browser per page: pages in one browser share its screenshot pipeline and barely speed up.
  const browsers = await allOrClose(
    Array.from({ length: Math.max(1, options.pages ?? PAGES) }, launchBrowser),
    (browser) => browser.close(),
  );
  try {
    const rendered: RenderedTheme[] = [];
    const { themes } = options.settings;
    for (const [themeIndex, theme] of themes.entries()) {
      options.signal?.throwIfAborted();
      rendered.push(
        await renderTheme(browsers, { theme, themeIndex, themes: themes.length }, options),
      );
    }
    return rendered;
  } finally {
    await closeAll(browsers, (browser) => browser.close());
  }
};

/** Waits for all of `starting`; if any fails, closes the ones that started and throws the first error. */
const allOrClose = async <T>(
  starting: readonly Promise<T>[],
  close: (started: T) => Promise<void>,
): Promise<T[]> => {
  const settled = await Promise.allSettled(starting);
  const started = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const failed = settled.find((s) => s.status === "rejected");
  if (failed) {
    await closeAll(started, close);
    throw failed.reason;
  }
  return started;
};

/**
 * Closes everything and ignores failed closes: on the error path they would
 * hide the real error, and after a render the files are already written.
 */
const closeAll = async <T>(items: readonly T[], close: (item: T) => Promise<void>) => {
  await Promise.allSettled(items.map(close));
};

const renderTheme = async (
  browsers: readonly Browser[],
  { theme, themeIndex, themes }: { theme: ThemeMode; themeIndex: number; themes: number },
  { project, settings, outDir, pageUrl, onProgress, onStep, signal, audio }: RenderOptions,
): Promise<RenderedTheme> => {
  const dir = join(outDir, theme);
  await mkdir(dir, { recursive: true });
  const files: RenderedTheme = {
    theme,
    video: join(dir, RENDER_FILES.video),
    clean: join(dir, RENDER_FILES.clean),
    captions: join(dir, RENDER_FILES.captions),
    poster: join(dir, RENDER_FILES.poster),
    contactSheet: join(dir, RENDER_FILES.contactSheet),
    ...(audio ? { audio: join(dir, RENDER_FILES.audio) } : {}),
  };
  const narrationShown = project.config.captions.narration;
  const injected = { ...project, mode: theme };
  const pages = await allOrClose(
    browsers.map((browser) => openPage(browser, pageUrl, injected)),
    (page) => page.close(),
  );
  try {
    signal?.throwIfAborted();
    const [first] = pages;
    if (!first) throw new Error("no render page opened");
    const { duration, cues } = await first.evaluate(() => {
      const w = window as unknown as Seekable;
      return { duration: w.__duration, cues: w.__cues };
    });
    const times = frameTimes(duration);
    const resolution = settings.resolution;
    let shown = 0;
    onStep?.({ step: "frames" });
    const encode = (out: string) =>
      encodeArgs({ fps: FPS, resolution, out, ...(audio ? { audio } : {}) });
    type Write = (frame: Buffer) => Promise<void>;
    /** Captures every frame into the captioned video and, when given one, the clean video. */
    const capture = (writeVideo: Write, writeClean?: Write) =>
      captureInOrder({
        count: times.length,
        workers: pages.length,
        // Two frames a page keeps every page busy while one waits on a slower neighbour.
        ahead: 2 * pages.length,
        capture: (worker, i) => {
          signal?.throwIfAborted();
          return framesAt(pages[worker] as Page, times[i] as number, writeClean !== undefined);
        },
        write: async (frames, i) => {
          await Promise.all([
            writeVideo(frames.captioned),
            frames.clean && writeClean ? writeClean(frames.clean) : undefined,
          ]);
          const hundredth = Math.floor(((i + 1) / times.length) * 100);
          if (hundredth > shown) {
            shown = hundredth;
            onProgress?.({ theme, done: i + 1, total: times.length, themeIndex, themes });
          }
        },
      });
    // One seek a frame feeds both videos: the clean frame is taken with the narration hidden.
    // Without narration captions the two would be the same, so the clean one is a copy.
    if (narrationShown)
      await pipeFrames(encode(files.video), (writeVideo) =>
        pipeFrames(encode(files.clean), (writeClean) => capture(writeVideo, writeClean)),
      );
    else {
      await pipeFrames(encode(files.video), (writeVideo) => capture(writeVideo));
      await copyFile(files.video, files.clean);
    }
    if (audio && files.audio) await copyFile(audio, files.audio);
    signal?.throwIfAborted();
    onStep?.({ step: "finishing" });
    const plan = buildBeats(
      project.storyboard,
      project.graph,
      beatOptions(project.config, project.narration),
    );
    const poster = await frameAt(first, Math.min(posterTime(plan), duration));
    await pipeFrames(posterArgs({ resolution, out: files.poster }), (write) => write(poster));
    await writeFile(files.captions, toSrt(cues));
    await writeFile(files.contactSheet, await contactSheetOf(browsers[0] as Browser, first));
    return files;
  } finally {
    await closeAll(pages, (page) => page.close());
  }
};

/** Opens the render page with the project on it, and waits until it is drawn. */
export const openPage = async (
  browser: Browser,
  url: string,
  project: InjectedProject,
): Promise<Page> => {
  const page = await browser.newPage({ viewport: STAGE });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((injected) => {
    (window as unknown as { __project: unknown }).__project = injected;
  }, project);
  await page.goto(url);
  await page.waitForFunction(
    () => document.body.dataset.ready === "true" || document.body.dataset.error !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  const failed = await page.evaluate(() => document.body.dataset.error);
  if (failed !== undefined || errors.length > 0)
    throw new Error(`the render page failed:\n${[failed, ...errors].filter(Boolean).join("\n")}`);
  return page;
};

const frameAt = async (page: Page, t: number): Promise<Buffer> => {
  await page.evaluate((time) => (window as unknown as Seekable).__seek(time), t);
  return page.screenshot({ type: "png" });
};

/** The frame at `t` with its narration captions, and, when asked, the same frame without them. */
const framesAt = async (
  page: Page,
  t: number,
  clean: boolean,
): Promise<{ readonly captioned: Buffer; readonly clean?: Buffer }> => {
  const captioned = await frameAt(page, t);
  if (!clean) return { captioned };
  await page.evaluate(() => (window as unknown as Seekable).__captions(false));
  const bare = await page.screenshot({ type: "png" });
  await page.evaluate(() => (window as unknown as Seekable).__captions(true));
  return { captioned, clean: bare };
};

/** The beats the render page reports (`__beats`), checked: the page is ours, so a bad one is a bug. */
export const beatsOnPage = async (page: Page): Promise<BeatSpan[]> => {
  const reported = parseWith(
    z.array(BeatSpanSchema),
    await page.evaluate(() => (window as unknown as { __beats: unknown }).__beats),
  );
  if (!reported.ok)
    throw new Error(
      `the render page reported beats it should not:\n${formatErrors(reported.errors).join("\n")}`,
    );
  return reported.value;
};

/** One still per beat, at the moment the checks look at, on one image (SPEC, Rendering); a render runs no checks, so none is marked. */
const contactSheetOf = async (browser: Browser, page: Page): Promise<Buffer> => {
  const beats = await beatsOnPage(page);
  const stills: Buffer[] = [];
  for (const beat of beats) stills.push(await frameAt(page, stillAt(beat)));
  return drawSheet(browser, { beats, stills, warnings: [], size: "full" });
};
