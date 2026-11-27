#!/usr/bin/env node
import { join, resolve } from "node:path";
import { kokoroProvider } from "../audio/kokoro.ts";
import { checkProjectFolder, skippedChecks } from "../render/check.ts";
import { CHECK_REPORT } from "../render/check-files.ts";
import { missingRenderTools } from "../render/environment.ts";
import { loadProject } from "../render/load.ts";
import { renderProjectFolder, withNarration } from "../render/run.ts";
import { renderSettings } from "../render/settings.ts";
// The explain-it command line. Usage:
//   explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]
//   explain-it check  <project>   every check into <project>/checks.json; exits 1 on problems, 2 when it cannot check
//   CACHE_DIR   the cache folder, for the voice model; ./cache by default
import { STORY_CHECKS } from "../schema/checks.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseRenderArgs } from "./args.ts";
import { parseCheckArgs } from "./check-args.ts";
import { checkLines } from "./check-output.ts";

const USAGE = `usage:
  explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]
  explain-it check  <project>`;

/** Thrown by `fail` and caught where the CLI starts: the exit code is already set. */
class CliExit extends Error {}

/**
 * Says what went wrong and ends the command with `code`. Not process.exit:
 * exiting at once, with the voice's ONNX threads still about, can abort the
 * process (exit code 134) as it shuts down; Node exits by itself instead.
 */
const fail = (lines: readonly string[], code: number): never => {
  for (const line of lines) console.error(line);
  process.exitCode = code;
  throw new CliExit();
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
      const tts = kokoroProvider({ cacheDir: resolve(process.env.CACHE_DIR ?? "cache") });
      const voiced = await withNarration(dir, project.value, tts).catch(async (error: unknown) => {
        await tts.close?.();
        return fail([error instanceof Error ? error.message : String(error)], 1);
      });
      // The voice is done with: let its model go, so the render has its memory.
      await tts.close?.();
      const made = voiced.lines.filter((line) => !line.cached).length;
      if (voiced.lines.length > 0)
        console.log(
          `voice: ${voiced.lines.length} lines (${made} generated, ${voiced.lines.length - made} cached)`,
        );
      const shown = new Map<string, number>();
      const rendered = await renderProjectFolder({
        dir,
        project: voiced.project,
        lines: voiced.lines,
        settings,
        now: new Date(),
        onProgress: ({ theme, done, total }) => {
          // Progress comes every hundredth; a terminal needs only every tenth.
          const tenth = Math.floor((done / total) * 10);
          if (tenth > (shown.get(theme) ?? 0)) {
            shown.set(theme, tenth);
            console.log(`${theme}: ${tenth * 10}% (${done}/${total} frames)`);
          }
        },
      });
      for (const r of rendered)
        console.log(
          [
            `${r.theme}: ${r.video}`,
            r.clean,
            r.captions,
            r.poster,
            r.gif,
            ...(r.audio ? [r.audio] : []),
          ].join("\n       "),
        );
    }
  }
};

/**
 * Runs every check on a project, as the MCP check tool does, timed by its
 * voice (or by the estimate when the voice cannot be made), skipping those
 * a missing program or voice stops. Exits 1 when it finds problems, 2 when
 * it cannot check at all.
 */
const check = async (argv: readonly string[]): Promise<void> => {
  const args = parseCheckArgs(argv);
  if (!args.ok) return fail([...formatErrors(args.errors), USAGE], 2);
  const dir = resolve(args.value.project);
  const project = await loadProject(dir);
  if (!project.ok)
    return fail([`${dir} is not a valid project:`, ...formatErrors(project.errors)], 2);
  const tts = kokoroProvider({ cacheDir: resolve(process.env.CACHE_DIR ?? "cache") });
  const voiced = await withNarration(dir, project.value, tts).then(
    (done) => ({ ...done, failed: false }),
    (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`${reason}; checking at the estimated timing`);
      return { project: project.value, lines: [], failed: true };
    },
  );
  // The voice is done with: let its model go.
  await tts.close?.();
  const skip = skippedChecks(await missingRenderTools(), { voiceFailed: voiced.failed });
  const report = await checkProjectFolder({
    dir,
    project: voiced.project,
    lines: voiced.lines,
    skip,
    now: new Date(),
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    return fail([`the checks could not run: ${reason}`], 2);
  });
  for (const line of checkLines(report, join(dir, CHECK_REPORT))) console.log(line);
  // The story checks are advice: they are reported, but only the others fail the check.
  const failing = report.warnings.filter(
    (w) => !(STORY_CHECKS as readonly string[]).includes(w.check),
  );
  // Not process.exit, for the reason `fail` gives.
  if (failing.length > 0) process.exitCode = 1;
};

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "render") await render(rest);
  else if (command === "check") await check(rest);
  else fail([command === undefined ? "no command" : `unknown command "${command}"`, USAGE], 2);
} catch (error) {
  if (!(error instanceof CliExit)) throw error;
}
