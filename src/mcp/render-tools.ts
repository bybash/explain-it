import { join } from "node:path";
import { generateVoice, narrationLengths, VOICE_OFF_HINT } from "../audio/voice.ts";
import type { MissingTool } from "../render/environment.ts";
import { loadProject, type ProjectFiles } from "../render/load.ts";
import type { VoiceConfig } from "../schema/config.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import { CheckArgsSchema, RenderArgsSchema, RenderJobArgsSchema } from "../schema/mcp.ts";
import { fail, ok } from "../schema/result.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { openProject, projectDir } from "../server/projects.ts";
import { timingOf } from "./edits.ts";
import type { ToolContext } from "./tools.ts";

type Args = Readonly<Record<string, unknown>>;

/**
 * What `check` cannot look at yet: the checks come with slices 2.5 to 2.7,
 * loudness among them. Saying so keeps an agent from
 * reading a clean report as a passed check.
 */
const NOT_CHECKED_YET = [
  "reading speed, narration fit and loudness: not run yet",
  "contact sheet: not made yet",
] as const;

/**
 * The narration, spoken: every line not in the cache yet is generated now,
 * which takes a while the first time (the voice model downloads).
 */
const voiceReport = async (
  context: ToolContext,
  slug: string,
  storyboard: Storyboard,
  voice: VoiceConfig,
) => {
  if (!voice.enabled) return { report: { state: "off" } as const, lines: [] };
  try {
    const lines = await generateVoice({
      projectDir: projectDir(context.projectsDir, slug),
      storyboard,
      voice,
      tts: context.tts,
    });
    const cached = lines.filter((line) => line.cached).length;
    const report = {
      state: "ready",
      id: voice.id,
      speed: voice.speed,
      lines: lines.length,
      generated: lines.length - cached,
      cached,
      seconds: Math.round(lines.reduce((sum, line) => sum + line.seconds, 0) * 10) / 10,
    } as const;
    return { report, lines };
  } catch (error) {
    // A model that cannot download or load is a broken environment: reported, not thrown at the agent.
    const message = error instanceof Error ? error.message : String(error);
    return { report: { state: "failed", error: message } as const, lines: [] };
  }
};

/**
 * The layout checks (overlap, off-frame) on the project's page, timed by its
 * voice, with the report written to `checks.json`; or why they did not run.
 * Their warnings do not stop a render.
 */
const layoutReport = async (
  context: ToolContext,
  slug: string,
  project: ProjectFiles | undefined,
  missing: readonly MissingTool[],
) => {
  if (!project)
    return { state: "not run", reason: "the project does not load (see problems)" } as const;
  if (missing.some((m) => m.tool === "chrome"))
    return { state: "not run", reason: "Chrome is not available" } as const;
  const dir = projectDir(context.projectsDir, slug);
  try {
    const { beats, warnings } = await context.runChecks(dir, project);
    return { state: "checked", beats, warnings, report: join(dir, "checks.json") } as const;
  } catch (error) {
    // The page did not build or Chrome would not run: reported, so the rest of the report still arrives.
    return {
      state: "failed",
      error: error instanceof Error ? error.message : String(error),
    } as const;
  }
};

const noProject = (slug: string) => fail([{ path: "slug", message: `no project "${slug}"` }]);

/**
 * Whether a project can render, and why not: every file it needs, read the
 * way the renderer reads it, and Chrome and ffmpeg on this machine. Also
 * generates the narration voice, and reports its stale beats and the
 * timing it measures.
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
  const voice = loaded.ok
    ? await voiceReport(context, slug, loaded.value.storyboard, loaded.value.config.voice)
    : null;
  // A render generates the voice while it is on, so a voice that fails stops it too.
  const problems = [
    ...(loaded.ok ? [] : formatErrors(loaded.errors)),
    ...missing.map((m) => `${m.tool}: ${m.message}`),
    ...(voice?.report.state === "failed"
      ? [`voice: ${voice.report.error}. ${VOICE_OFF_HINT}`]
      : []),
  ];
  return ok({
    ready: problems.length === 0,
    problems,
    voice: voice?.report ?? null,
    layout: await layoutReport(
      context,
      slug,
      loaded.ok ? { ...loaded.value, narration: narrationLengths(voice?.lines ?? []) } : undefined,
      missing,
    ),
    staleBeats: opened.value.project.staleBeats,
    timing: loaded.ok
      ? timingOf(
          loaded.value.storyboard,
          loaded.value.graph,
          loaded.value.config,
          narrationLengths(voice?.lines ?? []),
        )
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
