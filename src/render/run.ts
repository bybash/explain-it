import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { makeSoundtrack } from "../audio/soundtrack.ts";
import type { TtsProvider } from "../audio/tts.ts";
import { generateVoice, narrationLengths, VOICE_OFF_HINT, type VoiceLine } from "../audio/voice.ts";
import { projectBeats } from "../engine/beats/build.ts";
import { formatErrors } from "../schema/errors.ts";
import {
  RENDER_FILES,
  RENDER_MANIFEST,
  type RenderedTheme,
  type RenderManifest,
  renderStamp,
} from "../schema/render.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import type { RenderRun } from "./queue.ts";
import {
  type RenderControl,
  type RenderOptions,
  type RenderSettings,
  renderProject,
} from "./render.ts";
import { renderSettings } from "./settings.ts";
import { writeWhole } from "./write-whole.ts";

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

/** The tools a render works with: ffmpeg's mix and Chrome's pages in the app, stand-ins in tests. */
export type RenderTools = {
  /** Mixes the soundtrack. */
  readonly mix?: typeof makeSoundtrack;
  /** Renders every theme's frames and files on the render page. */
  readonly renderPages?: RenderPages;
};

export type RenderFolderOptions = RenderControl &
  RenderTools & {
    /** The project's folder; the render goes in its `out/<time>/`. */
    readonly dir: string;
    readonly project: ProjectFiles;
    readonly settings: RenderSettings;
    readonly now: Date;
    /** The spoken lines (see `withNarration`), mixed into the soundtrack; none for a silent voice. */
    readonly lines?: readonly VoiceLine[];
    /** The same soundtrack mixed already (the Preview gate's), copied instead of mixing it again. */
    readonly premixed?: string | undefined;
  };

/**
 * The preview's soundtrack copied in as this render's, when it is still
 * there: a preview of edited files may remove it between being found and
 * being copied, and then the render mixes its own.
 */
const copied = (premixed: string, to: string): Promise<boolean> =>
  copyFile(premixed, to).then(
    () => true,
    () => false,
  );

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
  const stamp = renderStamp(now);
  const outDir = join(dir, "out", stamp);
  try {
    await mkdir(outDir, { recursive: true });
    control.onFolder?.(stamp);
    // One soundtrack for every theme; each theme's folder gets a copy (`renderProject`).
    const soundtrack = join(outDir, RENDER_FILES.audio);
    let audio: string | undefined;
    if (premixed && (await copied(premixed, soundtrack))) audio = soundtrack;
    else {
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
        seconds: projectBeats(project).duration,
      });
      // A cancel while the manifest was written still wins: the queue records it as cancelled, so nothing is kept.
      control.signal?.throwIfAborted();
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
const writeManifest = (outDir: string, manifest: RenderManifest) =>
  writeWhole(join(outDir, RENDER_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

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
export type FolderRenderOptions = RenderTools & {
  /** The preview's soundtrack for these files, when it has been mixed: the same mix a render would make. */
  readonly soundtrackFor?: (slug: string, project: ProjectFiles) => Promise<string | undefined>;
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
    { soundtrackFor, ...tools }: FolderRenderOptions = {},
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
      ...tools,
      ...control,
    });
  };
