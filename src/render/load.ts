import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { type Card, parseCard } from "../schema/card.ts";
import {
  BYTES_PER_MB,
  type Config,
  DEFAULT_CONFIG,
  LOGO_MAX_BYTES,
  LOGO_MAX_MB,
  LOGO_TYPES,
  type Logo,
  type LogoImages,
  type LogoType,
  parseConfig,
} from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { type Layout, parseLayout } from "../schema/layout.ts";
import type { Narration } from "../schema/narration.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";

/** The validated files a project needs to be drawn. */
export type ProjectFiles = {
  readonly graph: Graph;
  readonly storyboard: Storyboard;
  readonly layout: Layout;
  readonly config: Config;
  /** The logo's files as data URLs, one per mode; missing when the config has no logo. */
  readonly logo?: LogoImages;
  /** Measured narration by beat, once the voice is generated (see `run.ts`). */
  readonly narration?: Narration;
  /** The TL;DR card (`card.json`), when the project has one; else it is made from the script. */
  readonly card?: Card;
};

/** Where a missing file's fix is not obvious. */
const HINTS: Readonly<Record<string, string>> = {
  "layout.json": "missing; run `npm run layout -- <project>`",
};

/** A JSON file read from a project folder: its data, or why it could not be read. */
export type JsonFile =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly missing: boolean; readonly error: ValidationError };

export const readJson = async (dir: string, file: string): Promise<JsonFile> => {
  let text: string;
  try {
    text = await readFile(join(dir, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { ok: false, missing: true, error: { path: file, message: HINTS[file] ?? "missing" } };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      missing: false,
      error: { path: file, message: `not valid JSON (${(error as Error).message})` },
    };
  }
};

/** Puts the file name in front of each error's path: `storyboard.json: scenes[0].title`. */
export const inFile = (file: string, errors: readonly ValidationError[]): ValidationError[] =>
  errors.map((e) => ({ path: `${file}: ${e.path}`, message: e.message }));

/**
 * Reads a project folder's graph, storyboard, layout and config, and its
 * card when it has one, each through its schema. A missing config means every
 * default. The storyboard and layout
 * are checked against the graph, so they are skipped while the graph is broken.
 */
export const loadProject = async (dir: string): Promise<Validated<ProjectFiles>> => {
  const [graphFile, storyboardFile, layoutFile, configFile, cardFile] = await Promise.all(
    ["graph.json", "storyboard.json", "layout.json", "config.json", "card.json"].map((f) =>
      readJson(dir, f),
    ),
  );
  if (!graphFile || !storyboardFile || !layoutFile || !configFile || !cardFile)
    throw new Error("unreachable");
  const errors: ValidationError[] = [];

  let config = DEFAULT_CONFIG;
  if (configFile.ok) {
    const parsed = parseConfig(configFile.data);
    if (parsed.ok) config = parsed.value;
    else errors.push(...inFile("config.json", parsed.errors));
  } else if (!configFile.missing) errors.push(configFile.error);

  if (!graphFile.ok) return fail([graphFile.error, ...errors]);
  const graph = parseGraph(graphFile.data);
  if (!graph.ok) return fail([...inFile("graph.json", graph.errors), ...errors]);

  const storyboard = storyboardFile.ok
    ? parseStoryboard(storyboardFile.data, graph.value)
    : undefined;
  const layout = layoutFile.ok ? parseLayout(layoutFile.data, graph.value) : undefined;
  if (!storyboardFile.ok) errors.push(storyboardFile.error);
  else if (storyboard && !storyboard.ok)
    errors.push(...inFile("storyboard.json", storyboard.errors));
  if (!layoutFile.ok) errors.push(layoutFile.error);
  else if (layout && !layout.ok) errors.push(...inFile("layout.json", layout.errors));

  // A missing card is made from the script; a broken one is reported like any broken file.
  const card = cardFile.ok ? parseCard(cardFile.data) : undefined;
  if (!cardFile.ok && !cardFile.missing) errors.push(cardFile.error);
  else if (card && !card.ok) errors.push(...inFile("card.json", card.errors));

  const logo = config.logo ? await readLogo(dir, config.logo) : undefined;
  if (logo && !logo.ok) errors.push(...inFile("config.json", logo.errors));

  if (errors.length > 0 || !storyboard?.ok || !layout?.ok) return fail(errors);
  return ok({
    graph: graph.value,
    storyboard: storyboard.value,
    layout: layout.value,
    config,
    ...(logo?.ok ? { logo: logo.value } : {}),
    ...(card?.ok ? { card: card.value } : {}),
  });
};

/** How each image type starts, and its name in an error. */
const SIGNATURES: Readonly<Record<LogoType, { name: string; matches: (data: Buffer) => boolean }>> =
  {
    "image/png": {
      name: "a PNG",
      matches: (data) => data.subarray(0, 4).toString("latin1") === "\x89PNG",
    },
    "image/jpeg": {
      name: "a JPEG",
      matches: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
    },
    // An SVG may open with an XML declaration, a doctype or comments before its root element.
    "image/svg+xml": {
      name: "an SVG",
      matches: (data) => /<svg[\s/>]/.test(data.subarray(0, 4096).toString("utf8")),
    },
  };

/** What is wrong with a logo file of `bytes`, if it is too big. */
export const sizeProblem = (bytes: number): string | undefined => {
  if (bytes <= LOGO_MAX_BYTES) return undefined;
  const mb = Math.ceil((bytes / BYTES_PER_MB) * 10) / 10;
  return `is ${mb.toFixed(1)} MB, max ${LOGO_MAX_MB} MB`;
};

/** What is wrong with `data` as an image of `type`, if it does not start the way that type does. */
export const imageProblem = (type: LogoType, data: Buffer): string | undefined => {
  const signature = SIGNATURES[type];
  return signature.matches(data) ? undefined : `is not ${signature.name} image`;
};

/**
 * Reads one logo file named in config.json from the project's `assets/`, as a
 * data URL, after checking its size and content. Errors name `logo.<mode>`.
 */
export const readAssetLogo = async (
  dir: string,
  mode: keyof LogoImages,
  name: string,
): Promise<Validated<string>> => {
  const file = join(dir, "assets", name);
  const report = (message: string) =>
    fail([{ path: `logo.${mode}`, message: `assets/${name} ${message}` }]);
  // Files the user names are theirs to fix, so any reason they can't be read is a field error.
  const unreadable = (error: unknown) => {
    const { code, message } = error as NodeJS.ErrnoException;
    return report(code === "ENOENT" ? "missing" : `could not be read (${code ?? message})`);
  };
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(file);
  } catch (error) {
    return unreadable(error);
  }
  if (!info.isFile()) return report("is not a file");
  const tooBig = sizeProblem(info.size);
  if (tooBig) return report(tooBig);
  // The schema allows only the extensions LOGO_TYPES lists.
  const type = LOGO_TYPES[extname(name) as keyof typeof LOGO_TYPES];
  let data: Buffer;
  try {
    data = await readFile(file);
  } catch (error) {
    return unreadable(error);
  }
  const notImage = imageProblem(type, data);
  if (notImage) return report(notImage);
  return ok(`data:${type};base64,${data.toString("base64")}`);
};

/** Reads the logo's files from `assets/` as data URLs; a single file serves both modes. */
export const readLogo = async (dir: string, logo: Logo): Promise<Validated<LogoImages>> => {
  const read = async (mode: keyof LogoImages) => {
    const name = logo[mode];
    return name === undefined ? undefined : readAssetLogo(dir, mode, name);
  };
  const light = await read("light");
  const dark = await read("dark");
  const errors = [light, dark].flatMap((r) => (r && !r.ok ? r.errors : []));
  const lightUrl = light?.ok ? light.value : undefined;
  const darkUrl = dark?.ok ? dark.value : undefined;
  const either = lightUrl ?? darkUrl;
  if (errors.length > 0 || either === undefined) return fail(errors);
  return ok({ light: lightUrl ?? either, dark: darkUrl ?? either });
};
