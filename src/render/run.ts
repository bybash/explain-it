import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeSoundtrack } from "../audio/soundtrack.ts";
import type { TtsProvider } from "../audio/tts.ts";
import { generateVoice, narrationLengths, VOICE_OFF_HINT, type VoiceLine } from "../audio/voice.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { formatErrors } from "../schema/errors.ts";
import { RENDER_FILES, type RenderedTheme, type RenderManifest } from "../schema/render.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import type { RenderRun } from "./queue.ts";
import {
  type RenderControl,
  type RenderOptions,
  type RenderSettings,
  renderProject,
} from "./render.ts";
import { RENDER_MANIFEST } from "./renders.ts";
import { renderSettings } from "./settings.ts";

/** A folder name for one render: the time it started, to the millisecond, safe in a path. */
export const renderStamp = (now: Date): string => now.toISOString().replaceAll(":", "-");

/** Renders the served page's frames into each theme's folder: Chrome and ffmpeg in the app, a fake in tests. */
export type RenderPages = (options: Omit<RenderOptions, "pageUrl">) => Promise<RenderedTheme[]>;

/** The render page built and served for the length of the render, and every theme rendered on it. */
const onRenderPage: RenderPages = async (options) => {
  const page = await buildRenderPage();
  try {
    options.signal?.throwIfAborted();
    const server = await serveRenderPage(page.dir);
    try {
      return await renderProject({ ...options, pageUrl: server.url });
    } finally {
      await server.close();
    }
  } finally {
    await page.remove();
  }
};

export type RenderFolderOptions = RenderControl & {
  /** The project's folder; the render goes in its `out/<time>/`. */
  readonly dir: string;
  readonly project: ProjectFiles;
  readonly settings: RenderSettings;
  readonly now: Date;
  /** The spoken lines (see `withNarration`), mixed into the soundtrack; none for a silent voice. */
  readonly lines?: readonly VoiceLine[];
  /** The same soundtrack mixed already (the Preview gate's), copied instead of mixing it again. */
  readonly premixed?: string | undefined;
  /** Mixes the soundtrack: ffmpeg's master in the app, a fake in tests. */
  readonly mix?: typeof makeSoundtrack;
  readonly renderPages?: RenderPages;
};

/**
 * Renders a loaded project into its `out/<time>/<theme>/` folders: the
 * soundtrack mixed (or the preview's copied), every theme rendered on the
 * render page, then `render.json` written, which makes it a finished render
 * the Render gate lists. A render that fails or is cancelled leaves nothing
 * behind: its whole `out/<time>/` folder is removed.
 */
export const renderProjectFolder = async ({
  dir,
  project,
  settings,
  now,
  lines = [],
  premixed,
  mix = makeSoundtrack,
  renderPages = onRenderPage,
  ...control
}: RenderFolderOptions): Promise<RenderedTheme[]> => {
  const outDir = join(dir, "out", renderStamp(now));
  try {
    await mkdir(outDir, { recursive: true });
    // One soundtrack for every theme; each theme's folder gets a copy (`renderProject`).
    const soundtrack = join(outDir, RENDER_FILES.audio);
    let audio: string | undefined;
    if (premixed) {
      await copyFile(premixed, soundtrack);
      audio = soundtrack;
    } else {
      control.onStep?.({ step: "mix" });
      audio = await mix({
        project,
        lines,
        out: soundtrack,
        ...(control.signal ? { signal: control.signal } : {}),
      });
    }
    control.signal?.throwIfAborted();
    try {
      const rendered = await renderPages({
        project,
        settings,
        outDir,
        ...control,
        ...(audio ? { audio } : {}),
      });
      control.signal?.throwIfAborted();
      await writeManifest(outDir, {
        version: 1,
        createdAt: now.toISOString(),
        resolution: settings.resolution,
        themes: rendered.map((r) => r.theme),
        seconds: buildBeats(
          project.storyboard,
          project.graph,
          beatOptions(project.config, project.narration),
        ).duration,
      });
      return rendered;
    } finally {
      await rm(soundtrack, { force: true });
    }
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    throw error;
  }
};

/** The manifest, written whole and then renamed: a render is listed only once it is complete. */
const writeManifest = async (outDir: string, manifest: RenderManifest) => {
  const file = join(outDir, RENDER_MANIFEST);
  await writeFile(`${file}.partial`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${file}.partial`, file);
};

/**
 * The project with its measured narration: every spoken line generated, or
 * read from the cache, so the video is timed by its voice. With the voice
 * off there is nothing to measure, and lines are timed by reading them.
 */
export const withNarration = async (
  dir: string,
  project: ProjectFiles,
  tts: TtsProvider,
  signal?: AbortSignal,
  onProgress?: (spoken: number, total: number) => void,
): Promise<{ readonly project: ProjectFiles; readonly lines: readonly VoiceLine[] }> => {
  const lines = await generateVoice({
    projectDir: dir,
    storyboard: project.storyboard,
    voice: project.config.voice,
    tts,
    ...(signal ? { signal } : {}),
    ...(onProgress ? { onProgress } : {}),
  }).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`the voice did not generate: ${message}. ${VOICE_OFF_HINT}`);
  });
  return {
    project: lines.length > 0 ? { ...project, narration: narrationLengths(lines) } : project,
    lines,
  };
};

/** What the app's renderer can be given besides the projects: the preview's soundtracks, and stand-ins for tests. */
export type FolderRenderOptions = {
  /** The preview's soundtrack for these files, when it has been mixed: the same mix a render would make. */
  readonly soundtrackFor?: (slug: string, project: ProjectFiles) => Promise<string | undefined>;
  readonly mix?: typeof makeSoundtrack;
  readonly renderPages?: RenderPages;
};

/**
 * The queue's renderer: reads the project's files and config as they are
 * when the job starts, so an edit made while it waited is rendered, and
 * times it by its voice, telling each line spoken. When the Preview gate
 * has mixed the same soundtrack, the render takes it instead of mixing again.
 */
export const renderFromFolder =
  (
    projectsDir: string,
    now: () => Date,
    tts: TtsProvider,
    { soundtrackFor, mix, renderPages }: FolderRenderOptions = {},
  ): RenderRun =>
  async ({ slug, theme, resolution }, control) => {
    const dir = join(projectsDir, slug);
    const loaded = await loadProject(dir);
    // Checked when queued; reaching this means the files changed while the job waited.
    if (!loaded.ok)
      throw new Error(
        `the project changed and can no longer render:\n${formatErrors(loaded.errors).join("\n")}`,
      );
    const settings = renderSettings(
      { ...(theme ? { theme } : {}), ...(resolution ? { resolution } : {}) },
      loaded.value.config,
    );
    const voiced = await withNarration(dir, loaded.value, tts, control.signal, (spoken, total) =>
      control.onStep({ step: "voice", spoken, total }),
    );
    const premixed = await soundtrackFor?.(slug, voiced.project);
    return renderProjectFolder({
      dir,
      project: voiced.project,
      lines: voiced.lines,
      settings,
      now: now(),
      premixed,
      ...(mix ? { mix } : {}),
      ...(renderPages ? { renderPages } : {}),
      ...control,
    });
  };
