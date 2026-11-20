import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { type Layout, parseLayout } from "../schema/layout.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";

/** The validated files a project needs to be drawn. */
export type ProjectFiles = {
  readonly graph: Graph;
  readonly storyboard: Storyboard;
  readonly layout: Layout;
  readonly config: Config;
};

/** Where a missing file's fix is not obvious. */
const HINTS: Readonly<Record<string, string>> = {
  "layout.json": "missing; run `npm run layout -- <project>`",
};

type Read =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly missing: boolean; readonly error: ValidationError };

const readJson = async (dir: string, file: string): Promise<Read> => {
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
const inFile = (file: string, errors: readonly ValidationError[]): ValidationError[] =>
  errors.map((e) => ({ path: `${file}: ${e.path}`, message: e.message }));

/**
 * Reads a project folder's graph, storyboard, layout and config, each through
 * its schema. A missing config means every default. The storyboard and layout
 * are checked against the graph, so they are skipped while the graph is broken.
 */
export const loadProject = async (dir: string): Promise<Validated<ProjectFiles>> => {
  const [graphFile, storyboardFile, layoutFile, configFile] = await Promise.all(
    ["graph.json", "storyboard.json", "layout.json", "config.json"].map((f) => readJson(dir, f)),
  );
  if (!graphFile || !storyboardFile || !layoutFile || !configFile) throw new Error("unreachable");
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

  if (errors.length > 0 || !storyboard?.ok || !layout?.ok) return fail(errors);
  return ok({ graph: graph.value, storyboard: storyboard.value, layout: layout.value, config });
};
