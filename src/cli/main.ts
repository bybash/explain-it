#!/usr/bin/env node
// The explain-it command line. Usage:
//   explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]
import { resolve } from "node:path";
import { loadProject } from "../render/load.ts";
import { renderProjectFolder } from "../render/run.ts";
import { renderSettings } from "../render/settings.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseRenderArgs } from "./args.ts";

const USAGE = `usage:
  explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]`;

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
      const rendered = await renderProjectFolder({
        dir,
        project: project.value,
        settings,
        now: new Date(),
        onProgress: ({ theme, done, total }) =>
          console.log(
            `${theme}: ${Math.floor((done / total) * 10) * 10}% (${done}/${total} frames)`,
          ),
      });
      for (const r of rendered)
        console.log(`${r.theme}: ${r.video}\n       ${r.captions}\n       ${r.poster}`);
    }
  }
};

const [command, ...rest] = process.argv.slice(2);
if (command === "render") await render(rest);
else fail([command === undefined ? "no command" : `unknown command "${command}"`, USAGE], 2);
