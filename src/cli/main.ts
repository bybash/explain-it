#!/usr/bin/env node
// The explain-it command line. Usage:
//   explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]
import { join, resolve } from "node:path";
import { loadProject } from "../render/load.ts";
import { buildRenderPage, serveRenderPage } from "../render/page.ts";
import { renderProject } from "../render/render.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseRenderArgs, renderSettings } from "./args.ts";

const USAGE = `usage:
  explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]`;

/** A folder name for one render: the time it started, safe in a path. */
const stamp = (now: Date): string =>
  now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");

const fail = (lines: readonly string[], code: number): never => {
  for (const line of lines) console.error(line);
  process.exit(code);
};

const render = async (argv: readonly string[]): Promise<void> => {
  const args = parseRenderArgs(argv);
  if (!args.ok) fail([...formatErrors(args.errors), USAGE], 2);
  else {
    const dir = resolve(args.value.project);
    const project = await loadProject(dir);
    if (!project.ok) fail([`${dir} is not a valid project:`, ...formatErrors(project.errors)], 1);
    else {
      const settings = renderSettings(args.value, project.value.config);
      const outDir = join(dir, "out", stamp(new Date()));
      buildRenderPage();
      const server = await serveRenderPage();
      try {
        const rendered = await renderProject({
          project: project.value,
          settings,
          outDir,
          pageUrl: server.url,
          onProgress: (line) => console.log(line),
        });
        for (const r of rendered)
          console.log(`${r.theme}: ${r.video}\n       ${r.captions}\n       ${r.poster}`);
      } finally {
        await server.close();
      }
    }
  }
};

const [command, ...rest] = process.argv.slice(2);
if (command === "render") await render(rest);
else fail([command === undefined ? "no command" : `unknown command "${command}"`, USAGE], 2);
