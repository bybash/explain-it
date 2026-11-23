import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseWith } from "../schema/errors.ts";
import {
  RENDER_FILES,
  type RenderedFolder,
  type RenderFile,
  RenderManifestSchema,
  RenderStampSchema,
} from "../schema/render.ts";

/** Written into `out/<time>/` once every theme is: a folder without it is not a finished render. */
export const RENDER_MANIFEST = "render.json";

/** The size of a file, or undefined when it is not there. */
const sizeOf = (path: string): Promise<number | undefined> =>
  stat(path).then(
    (s) => (s.isFile() ? s.size : undefined),
    () => undefined,
  );

/** A finished render's manifest, read from its folder; undefined for anything else. */
const manifestIn = async (outDir: string, stamp: string) => {
  if (!RenderStampSchema.safeParse(stamp).success) return undefined;
  const text = await readFile(join(outDir, stamp, RENDER_MANIFEST), "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    const manifest = parseWith(RenderManifestSchema, JSON.parse(text));
    return manifest.ok ? manifest.value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The project's finished renders, newest first (SPEC, Rendering): every
 * `out/<time>/` with its manifest, and each theme's files with their sizes.
 * A render still running, or one stopped part way, has no manifest yet and
 * is left out, as are folders that are not renders at all.
 */
export const rendersIn = async (projectDir: string): Promise<RenderedFolder[]> => {
  const outDir = join(projectDir, "out");
  const stamps = await readdir(outDir).catch(() => [] as string[]);
  const renders: RenderedFolder[] = [];
  for (const stamp of stamps.sort().reverse()) {
    const manifest = await manifestIn(outDir, stamp);
    if (!manifest) continue;
    const files: RenderedFolder["files"] = [];
    for (const theme of manifest.themes)
      for (const [file, name] of Object.entries(RENDER_FILES) as [RenderFile, string][]) {
        const bytes = await sizeOf(join(outDir, stamp, theme, name));
        if (bytes !== undefined) files.push({ theme, file, name, bytes });
      }
    const { version: _version, ...rest } = manifest;
    renders.push({ ...rest, stamp, files });
  }
  return renders;
};

/**
 * Where a finished render's file is, when the folder, the theme and the
 * name are one of its files; undefined for anything else, so no path
 * outside the project's renders is ever served.
 */
export const renderFilePath = async (
  projectDir: string,
  stamp: string,
  theme: string,
  name: string,
): Promise<string | undefined> => {
  const outDir = join(projectDir, "out");
  const manifest = await manifestIn(outDir, stamp);
  const known =
    manifest?.themes.some((t) => t === theme) &&
    (Object.values(RENDER_FILES) as string[]).includes(name);
  if (!known) return undefined;
  const path = join(outDir, stamp, theme, name);
  return (await sizeOf(path)) === undefined ? undefined : path;
};
