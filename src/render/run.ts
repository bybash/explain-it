import { join } from "node:path";
import type { ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import {
  type RenderedTheme,
  type RenderProgress,
  type RenderSettings,
  renderProject,
} from "./render.ts";

/** A folder name for one render: the time it started, safe in a path. */
export const renderStamp = (now: Date): string =>
  now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");

export type RenderFolderOptions = {
  /** The project's folder; the render goes in its `out/<time>/`. */
  readonly dir: string;
  readonly project: ProjectFiles;
  readonly settings: RenderSettings;
  readonly now: Date;
  readonly onProgress?: (progress: RenderProgress) => void;
  readonly signal?: AbortSignal;
};

/**
 * Renders a loaded project into its `out/<time>/<theme>/` folders: builds
 * the render page where Vite is installed, serves it for the length of the
 * render, and renders every theme. The CLI and the render queue both use it.
 */
export const renderProjectFolder = async ({
  dir,
  project,
  settings,
  now,
  onProgress,
  signal,
}: RenderFolderOptions): Promise<RenderedTheme[]> => {
  buildRenderPage();
  const server = await serveRenderPage();
  try {
    return await renderProject({
      project,
      settings,
      outDir: join(dir, "out", renderStamp(now)),
      pageUrl: server.url,
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    });
  } finally {
    await server.close();
  }
};
