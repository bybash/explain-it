import type { TtsProvider } from "../audio/tts.ts";
import { narrationLengths, readCachedVoice, type VoiceLine } from "../audio/voice.ts";
import { graphToMermaid } from "../mermaid/generate.ts";
import type { MissingTool } from "../render/environment.ts";
import type { ProjectFiles } from "../render/load.ts";
import { inFile, readAssetLogo, readJson } from "../render/load.ts";
import type { RenderQueue } from "../render/queue.ts";
import type { OpenedProject } from "../schema/api.ts";
import type { CheckReport } from "../schema/checks.ts";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../schema/config.ts";
import { formatErrors, parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import {
  CreateProjectArgsSchema,
  GetProjectArgsSchema,
  ListProjectsArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import type { Narration } from "../schema/narration.ts";
import type { Project } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import { staleBeats } from "../schema/stale.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import type { Events } from "../server/events.ts";
import { type CheckedLogo, checkLogo, saveLogo } from "../server/logo.ts";
import {
  listProjects,
  makeProject,
  openProject,
  projectDir,
  withProjectLock,
  writeProjectFile,
} from "../server/projects.ts";
import { allOf, asObject, edited, laidOut, laterGate, merged, timingOf, under } from "./edits.ts";

/** What the tools work with: the projects folder, the clock, the event hub and preview links. */
export type ToolContext = {
  readonly projectsDir: string;
  readonly now: () => Date;
  readonly events: Events;
  /** The web app's page for a project, for the agent to show its user. */
  readonly previewUrl: (slug: string) => string;
  /** The render jobs, shared with the web app. */
  readonly renders: RenderQueue;
  /** What a render needs from this machine and cannot find (see \`missingRenderTools\`). */
  readonly missingRenderTools: () => Promise<readonly MissingTool[]>;
  /** Runs the layout checks on a project's page and writes its `checks.json` (see `render/check.ts`). */
  readonly runChecks: (
    dir: string,
    project: ProjectFiles,
    lines: readonly VoiceLine[],
  ) => Promise<CheckReport>;
  /** Speaks the narration; Kokoro in the app, a fake in tests. */
  readonly tts: TtsProvider;
};

type Args = Readonly<Record<string, unknown>>;

const open = async (context: ToolContext, slug: string): Promise<Validated<OpenedProject>> =>
  (await openProject(context.projectsDir, slug)) ??
  fail([{ path: "slug", message: `no project "${slug}"` }]);

const saveProject = (context: ToolContext, slug: string, project: Project) =>
  writeProjectFile(context.projectsDir, slug, "project.json", {
    ...project,
    updatedAt: context.now().toISOString(),
  });

/** Whether opening the project found `file` broken. */
const broken = (opened: OpenedProject, file: string) =>
  opened.problems.some((p) => p.path === file || p.path.startsWith(`${file}:`));

export const listProjectsTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(ListProjectsArgsSchema, input);
  if (!args.ok) return args;
  const { projects, broken: unreadable } = await listProjects(context.projectsDir);
  return ok({
    projects: projects.map((p) => ({ ...p, preview: context.previewUrl(p.slug) })),
    broken: unreadable,
  });
};

export const getProjectTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(GetProjectArgsSchema, input);
  if (!args.ok) return args;
  const opened = await open(context, args.value.slug);
  if (!opened.ok) return opened;
  const { graph } = opened.value;
  return ok({
    ...opened.value,
    mermaid: graph ? graphToMermaid(graph) : null,
    preview: context.previewUrl(args.value.slug),
  });
};

export const createProjectTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(CreateProjectArgsSchema, input);
  const graph = input.graph === undefined ? undefined : parseGraph(input.graph);
  const graphErrors = graph && !graph.ok ? under("graph", graph.errors) : [];
  if (!args.ok || !graph?.ok) return fail([...allOf(args), ...graphErrors]);
  const layout = await laidOut(graph.value, null);
  if (!layout.ok) return layout;
  const { slug } = await makeProject(
    context.projectsDir,
    {
      name: args.value.name ?? graph.value.title,
      origin: "mcp",
      ...(args.value.sources ? { sources: args.value.sources } : {}),
    },
    context.now(),
    { "graph.json": graph.value, "layout.json": layout.value },
  );
  context.events.publish({ type: "project-created", slug });
  return ok({ slug, mermaid: graphToMermaid(graph.value), preview: context.previewUrl(slug) });
};

export const updateGraphTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(UpdateGraphArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  return withProjectLock(context.projectsDir, slug, async () => {
    const opened = await open(context, slug);
    if (!opened.ok) return opened;
    const before = opened.value;
    const next = edited("graph", before.graph, args.value.graph, args.value.patch);
    if (!next.ok) return next;
    const graph = parseGraph(next.value);
    if (!graph.ok) return fail(under("graph", graph.errors));
    const layout = await laidOut(graph.value, before.layout);
    if (!layout.ok) return layout;

    const stale =
      before.graph && before.storyboard
        ? staleBeats(before.graph, graph.value, before.storyboard)
        : [];
    const staleNow = [...new Set([...before.project.staleBeats, ...stale])];
    const recheck = before.storyboard ? parseStoryboard(before.storyboard, graph.value) : undefined;
    const storyboardProblems =
      recheck && !recheck.ok ? formatErrors(inFile("storyboard.json", recheck.errors)) : [];
    const warnings = broken(before, "layout.json")
      ? [
          "layout.json was broken, so the graph was laid out from scratch and any manual positions in it were dropped",
        ]
      : [];

    await writeProjectFile(context.projectsDir, slug, "graph.json", graph.value);
    await writeProjectFile(context.projectsDir, slug, "layout.json", layout.value);
    await saveProject(context, slug, { ...before.project, staleBeats: staleNow });
    context.events.publish({ type: "project-updated", slug });
    return ok({
      mermaid: graphToMermaid(graph.value),
      staleBeats: staleNow,
      storyboardProblems,
      warnings,
      preview: context.previewUrl(slug),
    });
  });
};

/** Each beat as JSON by id, to tell which beats a new storyboard rewrote. */
const beatsById = (storyboard: Storyboard | null) =>
  new Map((storyboard?.scenes ?? []).flatMap((s) => s.beats).map((b) => [b.id, JSON.stringify(b)]));

export const setStoryboardTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(SetStoryboardArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  return withProjectLock(context.projectsDir, slug, async () => {
    const opened = await open(context, slug);
    if (!opened.ok) return opened;
    const before = opened.value;
    if (!before.graph)
      return fail([
        { path: "graph.json", message: "missing; call create_project or update_graph first" },
      ]);
    const next = edited("storyboard", before.storyboard, args.value.storyboard, args.value.patch);
    if (!next.ok) return next;
    const storyboard = parseStoryboard(next.value, before.graph);
    if (!storyboard.ok) return fail(under("storyboard", storyboard.errors));

    // A stale beat stops being stale once it is rewritten; one left exactly as it was stays stale.
    const previous = beatsById(before.storyboard);
    const rewritten = beatsById(storyboard.value);
    const staleNow = before.project.staleBeats.filter(
      (id) => rewritten.has(id) && rewritten.get(id) === previous.get(id),
    );

    await writeProjectFile(context.projectsDir, slug, "storyboard.json", storyboard.value);
    await saveProject(context, slug, {
      ...before.project,
      staleBeats: staleNow,
      gate: laterGate(before.project.gate, "script"),
    });
    context.events.publish({ type: "project-updated", slug });
    return ok({
      timing: timingOf(
        storyboard.value,
        before.graph,
        before.config,
        await cachedNarration(context, slug, storyboard.value, before.config ?? DEFAULT_CONFIG),
      ),
      staleBeats: staleNow,
      preview: context.previewUrl(slug),
    });
  });
};

/**
 * The measured length of every line already in the voice cache, generating
 * none: editing the script stays quick, and timing is measured where it can be.
 */
const cachedNarration = async (
  context: ToolContext,
  slug: string,
  storyboard: Storyboard,
  config: Config,
): Promise<Narration> => {
  const lines = await readCachedVoice({
    projectDir: projectDir(context.projectsDir, slug),
    storyboard,
    voice: config.voice,
    tts: context.tts,
  });
  return narrationLengths(lines);
};

export const setStyleTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(SetStyleArgsSchema, input);
  if (!args.ok) return args;
  const { slug, config: changes = {}, logo } = args.value;
  return withProjectLock(context.projectsDir, slug, async () => {
    const opened = await open(context, slug);
    if (!opened.ok) return opened;
    const before = opened.value;
    const dir = projectDir(context.projectsDir, slug);

    // Check everything before writing anything, so a bad setting or logo changes nothing.
    const logos: CheckedLogo[] = [];
    const errors: ValidationError[] = [];
    const names: Record<string, string> = {};
    for (const mode of ["light", "dark"] as const) {
      const source = logo?.[mode];
      if (!source) continue;
      const checked = await checkLogo(mode, source);
      if (checked.ok) {
        logos.push(checked.value);
        names[mode] = checked.value.name;
      } else errors.push(...checked.errors);
    }
    const file = await readJson(dir, "config.json");
    const current = file.ok ? asObject(file.data) : undefined;
    const warnings =
      !file.ok && file.missing
        ? []
        : current === undefined
          ? ["config.json was broken, so it was started again from these settings"]
          : [];
    const { light: _light, dark: _dark, ...placement } = logo ?? {};
    const next = merged(
      merged(current ?? {}, changes),
      logo ? { logo: { ...placement, ...names } } : {},
    );
    const config = parseConfig(next);
    if (!config.ok) errors.push(...under("config", config.errors));
    // A logo named in config.json without being sent must already be in assets/ and pass its checks.
    else
      for (const mode of ["light", "dark"] as const) {
        const name = config.value.logo?.[mode];
        if (name === undefined || name === names[mode]) continue;
        const asset = await readAssetLogo(dir, mode, name);
        if (!asset.ok) errors.push(...under("config", asset.errors));
      }
    if (errors.length > 0) return fail(errors);

    for (const checked of logos) await saveLogo(dir, checked);
    await writeProjectFile(context.projectsDir, slug, "config.json", next);
    await saveProject(context, slug, {
      ...before.project,
      gate: laterGate(before.project.gate, "style"),
    });
    context.events.publish({ type: "project-updated", slug });
    return ok({
      config: config.ok ? config.value : null,
      warnings,
      preview: context.previewUrl(slug),
    });
  });
};
