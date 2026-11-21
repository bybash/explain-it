import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { TtsProvider } from "../audio/tts.ts";
import { generateVoice, narrationLengths, type VoiceLine } from "../audio/voice.ts";
import { formatErrors } from "../schema/errors.ts";
import type { RenderedTheme } from "../schema/render.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import type { RenderRun } from "./queue.ts";
import { type RenderControl, type RenderSettings, renderProject } from "./render.ts";
import { renderSettings } from "./settings.ts";

/** A folder name for one render: the time it started, to the millisecond, safe in a path. */
export const renderStamp = (now: Date): string => now.toISOString().replaceAll(":", "-");

export type RenderFolderOptions = RenderControl & {
  /** The project's folder; the render goes in its `out/<time>/`. */
  readonly dir: string;
  readonly project: ProjectFiles;
  readonly settings: RenderSettings;
  readonly now: Date;
};

/**
 * Renders a loaded project into its `out/<time>/<theme>/` folders: builds
 * the render page where Vite is installed, serves it for the length of the
 * render, and renders every theme. A render that fails or is cancelled
 * leaves nothing behind: its whole `out/<time>/` folder is removed.
 */
export const renderProjectFolder = async ({
  dir,
  project,
  settings,
  now,
  ...control
}: RenderFolderOptions): Promise<RenderedTheme[]> => {
  const outDir = join(dir, "out", renderStamp(now));
  try {
    const page = await buildRenderPage();
    try {
      control.signal?.throwIfAborted();
      const server = await serveRenderPage(page.dir);
      try {
        return await renderProject({ project, settings, outDir, pageUrl: server.url, ...control });
      } finally {
        await server.close();
      }
    } finally {
      await page.remove();
    }
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    throw error;
  }
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
): Promise<{ readonly project: ProjectFiles; readonly lines: readonly VoiceLine[] }> => {
  const lines = await generateVoice({
    projectDir: dir,
    storyboard: project.storyboard,
    voice: project.config.voice,
    tts,
  });
  return {
    project: lines.length > 0 ? { ...project, narration: narrationLengths(lines) } : project,
    lines,
  };
};

/**
 * The queue's renderer: reads the project's files and config as they are
 * when the job starts, so an edit made while it waited is rendered, and
 * times it by its voice.
 */
export const renderFromFolder =
  (projectsDir: string, now: () => Date, tts: TtsProvider): RenderRun =>
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
    const { project } = await withNarration(dir, loaded.value, tts);
    control.signal.throwIfAborted();
    return renderProjectFolder({ dir, project, settings, now: now(), ...control });
  };
