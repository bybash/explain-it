import jsonpatch, { type Operation } from "fast-json-patch";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { layoutGraph } from "../layout/layout.ts";
import { graphToMermaid } from "../mermaid/generate.ts";
import { inFile, readJson } from "../render/load.ts";
import type { OpenedProject } from "../schema/api.ts";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../schema/config.ts";
import { formatErrors, parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import {
  CreateProjectArgsSchema,
  GetProjectArgsSchema,
  ListProjectsArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import { GATES, type Gate, type Project } from "../schema/project.ts";
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
  writeProjectFile,
} from "../server/projects.ts";

/** What the tools work with: the projects folder, the clock, the event hub and preview links. */
export type ToolContext = {
  readonly projectsDir: string;
  readonly now: () => Date;
  readonly events: Events;
  /** The web app's page for a project, for the agent to show its user. */
  readonly previewUrl: (slug: string) => string;
};

type Args = Readonly<Record<string, unknown>>;

/** Puts a document's name in front of its errors' paths: `graph.nodes[0].kind`. */
const under = (name: string, errors: readonly ValidationError[]): ValidationError[] =>
  errors.map((e) => ({
    path: e.path === "(root)" ? name : `${name}.${e.path}`,
    message: e.message,
  }));

/** Collects the errors of several checks, so the agent sees all of them at once. */
const allOf = (...results: readonly Validated<unknown>[]): ValidationError[] =>
  results.flatMap((r) => (r.ok ? [] : r.errors));

const noProject = (slug: string) => fail([{ path: "slug", message: `no project "${slug}"` }]);

const open = async (context: ToolContext, slug: string): Promise<Validated<OpenedProject>> =>
  (await openProject(context.projectsDir, slug)) ?? noProject(slug);

/** A later gate than the project's, never an earlier one: approvals happen in the IDE's chat. */
const advance = (current: Gate, to: Gate): Gate =>
  GATES.indexOf(to) > GATES.indexOf(current) ? to : current;

const saveProject = (context: ToolContext, slug: string, project: Project) =>
  writeProjectFile(context.projectsDir, slug, "project.json", {
    ...project,
    updatedAt: context.now().toISOString(),
  });

/**
 * The new document from a whole one or a JSON Patch on the current one:
 * exactly one of the two. A failed patch step is named by its index.
 */
const edited = (
  file: "graph" | "storyboard",
  current: unknown,
  whole: unknown,
  patch: unknown,
): Validated<unknown> => {
  if (whole === undefined && patch === undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch` }]);
  if (whole !== undefined && patch !== undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch, not both` }]);
  if (whole !== undefined) return ok(whole);
  if (current === null)
    return fail([
      { path: "patch", message: `${file}.json is missing or broken; send the whole ${file}` },
    ]);
  try {
    return ok(
      jsonpatch.applyPatch(structuredClone(current), patch as Operation[], true, false).newDocument,
    );
  } catch (error) {
    const { index, message } = error as { index?: number; message: string };
    return fail([{ path: `patch[${index ?? 0}]`, message: message.split("\n")[0] ?? message }]);
  }
};

/** Lays the graph out, keeping the user's manual positions for the nodes it still has. */
const laidOut = async (graph: Graph, previous: Layout | null): Promise<Validated<Layout>> => {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const overrides = Object.fromEntries(
    Object.entries(previous?.overrides ?? {}).filter(([id]) => ids.has(id)),
  );
  const layout = await layoutGraph(graph, overrides);
  return layout.ok ? layout : fail(under("layout", layout.errors));
};

/** Each scene's and the whole video's estimated length, to a tenth of a second. */
const timingOf = (storyboard: Storyboard, graph: Graph, config: Config | null) => {
  const plan = buildBeats(storyboard, graph, beatOptions(config ?? DEFAULT_CONFIG));
  const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
  return {
    duration: tenth(plan.duration),
    scenes: plan.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      start: tenth(s.start),
      end: tenth(s.end),
    })),
  };
};

export const listProjectsTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(ListProjectsArgsSchema, input);
  if (!args.ok) return args;
  const { projects, broken } = await listProjects(context.projectsDir);
  return ok({
    projects: projects.map((p) => ({ ...p, preview: context.previewUrl(p.slug) })),
    broken,
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

  await writeProjectFile(context.projectsDir, slug, "graph.json", graph.value);
  await writeProjectFile(context.projectsDir, slug, "layout.json", layout.value);
  await saveProject(context, slug, { ...before.project, staleBeats: staleNow });
  context.events.publish({ type: "project-updated", slug });
  return ok({
    mermaid: graphToMermaid(graph.value),
    staleBeats: staleNow,
    storyboardProblems,
    preview: context.previewUrl(slug),
  });
};

export const setStoryboardTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(SetStoryboardArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
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
  const beats = (s: Storyboard | null) =>
    new Map(
      (s?.scenes ?? []).flatMap((scene) => scene.beats).map((b) => [b.id, JSON.stringify(b)]),
    );
  const old = beats(before.storyboard);
  const now = beats(storyboard.value);
  const staleNow = before.project.staleBeats.filter(
    (id) => now.has(id) && now.get(id) === old.get(id),
  );

  await writeProjectFile(context.projectsDir, slug, "storyboard.json", storyboard.value);
  await saveProject(context, slug, {
    ...before.project,
    staleBeats: staleNow,
    gate: advance(before.project.gate, "script"),
  });
  context.events.publish({ type: "project-updated", slug });
  return ok({
    timing: timingOf(storyboard.value, before.graph, before.config),
    staleBeats: staleNow,
    preview: context.previewUrl(slug),
  });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `changes` laid over `base`: objects merge, everything else replaces. */
const merged = (base: unknown, changes: unknown): unknown =>
  isPlainObject(base) && isPlainObject(changes)
    ? Object.fromEntries(
        [...new Set([...Object.keys(base), ...Object.keys(changes)])].map((key) => [
          key,
          key in changes ? merged(base[key], changes[key]) : base[key],
        ]),
      )
    : changes;

export const setStyleTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(SetStyleArgsSchema, input);
  if (!args.ok) return args;
  const { slug, config: changes = {}, logo } = args.value;
  const opened = await open(context, slug);
  if (!opened.ok) return opened;
  const before = opened.value;
  const dir = projectDir(context.projectsDir, slug);

  // Check everything before writing anything, so a bad setting or logo changes nothing.
  const logos: CheckedLogo[] = [];
  const logoErrors: ValidationError[] = [];
  const names: Record<string, string> = {};
  for (const mode of ["light", "dark"] as const) {
    const source = logo?.[mode];
    if (!source) continue;
    const checked = await checkLogo(mode, source);
    if (checked.ok) {
      logos.push(checked.value);
      names[mode] = checked.value.name;
    } else logoErrors.push(...checked.errors);
  }
  const file = await readJson(dir, "config.json");
  const current = file.ok && isPlainObject(file.data) ? file.data : {};
  const { light, dark, ...placement } = logo ?? {};
  const logoChanges = logo ? { logo: { ...placement, ...names } } : {};
  const config = parseConfig(merged(merged(current, changes), logoChanges));
  const configErrors = config.ok ? [] : under("config", config.errors);
  if (!config.ok || logoErrors.length > 0) return fail([...configErrors, ...logoErrors]);

  for (const checked of logos) await saveLogo(dir, checked);
  await writeProjectFile(
    context.projectsDir,
    slug,
    "config.json",
    merged(merged(current, changes), logoChanges),
  );
  await saveProject(context, slug, {
    ...before.project,
    gate: advance(before.project.gate, "style"),
  });
  context.events.publish({ type: "project-updated", slug });
  return ok({ config: config.value, preview: context.previewUrl(slug) });
};
