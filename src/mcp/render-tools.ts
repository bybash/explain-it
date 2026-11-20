import { loadProject } from "../render/load.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import { CheckArgsSchema, RenderArgsSchema, RenderJobArgsSchema } from "../schema/mcp.ts";
import { fail, ok } from "../schema/result.ts";
import { openProject, projectDir } from "../server/projects.ts";
import { timingOf } from "./edits.ts";
import type { ToolContext } from "./tools.ts";

type Args = Readonly<Record<string, unknown>>;

/**
 * What `check` cannot look at yet: the voice and the checks come with the
 * audio and checks slices (2.1, 2.5 to 2.7). Saying so keeps an agent from
 * reading a clean report as a passed check.
 */
const NOT_CHECKED_YET = [
  "narration voice: not generated yet; the video is silent, with captions",
  "overlap and off-frame checks: not run yet",
  "reading speed and narration fit: not run yet",
  "contact sheet: not made yet",
] as const;

const noProject = (slug: string) => fail([{ path: "slug", message: `no project "${slug}"` }]);

/**
 * Whether a project can render, and why not: every file it needs, read the
 * way the renderer reads it, and Chrome and ffmpeg on this machine. Also its
 * stale beats and estimated timing.
 */
export const checkTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(CheckArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  const opened = await openProject(context.projectsDir, slug);
  if (!opened) return noProject(slug);
  if (!opened.ok) return opened;
  const [loaded, missing] = await Promise.all([
    loadProject(projectDir(context.projectsDir, slug)),
    context.missingRenderTools(),
  ]);
  const problems = [...(loaded.ok ? [] : formatErrors(loaded.errors)), ...missing];
  return ok({
    ready: problems.length === 0,
    problems,
    staleBeats: opened.value.project.staleBeats,
    timing: loaded.ok
      ? timingOf(loaded.value.storyboard, loaded.value.graph, loaded.value.config)
      : null,
    notChecked: NOT_CHECKED_YET,
    preview: context.previewUrl(slug),
  });
};

/** Queues a render of a project that is ready, with the theme and resolution asked for or configured. */
export const renderTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(RenderArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  if (!(await openProject(context.projectsDir, slug))) return noProject(slug);
  const loaded = await loadProject(projectDir(context.projectsDir, slug));
  if (!loaded.ok) return loaded;
  const job = context.renders.add(args.value);
  return ok({ job, preview: context.previewUrl(slug) });
};

/** A render job: its state and progress, then its files or its error. */
export const renderStatusTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(RenderJobArgsSchema, input);
  if (!args.ok) return args;
  const job = context.renders.get(args.value.job);
  return job ? ok(job) : fail([{ path: "job", message: `no render job "${args.value.job}"` }]);
};

/** Stops a queued or running render. */
export const cancelRenderTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(RenderJobArgsSchema, input);
  if (!args.ok) return args;
  return context.renders.cancel(args.value.job);
};
