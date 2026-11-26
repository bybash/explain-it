import { layoutGraph } from "../layout/layout.ts";
import { inFile } from "../render/load.ts";
import type { GraphSaveOutcome, OpenedProject } from "../schema/api.ts";
import { formatErrors, under, type Validated } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import { fail, ok } from "../schema/result.ts";
import { staleBeats } from "../schema/stale.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { writeProjectFile } from "./projects.ts";

/** Lays the graph out, keeping the user's manual positions for the nodes it still has. */
export const laidOut = async (
  graph: Graph,
  previous: Layout | null,
): Promise<Validated<Layout>> => {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const overrides = Object.fromEntries(
    Object.entries(previous?.overrides ?? {}).filter(([id]) => ids.has(id)),
  );
  const layout = await layoutGraph(graph, overrides);
  return layout.ok ? layout : fail(under("layout", layout.errors));
};

/**
 * Saves a checked graph over a project's own (SPEC, User flow): lays it out
 * again keeping the user's manual positions, marks the beats that name what
 * changed as stale, and checks the storyboard against it. MCP's
 * `update_graph` and the graph gate's editor both save this way. The caller
 * holds the project lock and tells listeners.
 */
export const saveGraph = async (
  projectsDir: string,
  slug: string,
  before: OpenedProject,
  graph: Graph,
  now: Date,
): Promise<Validated<GraphSaveOutcome>> => {
  const layout = await laidOut(graph, before.layout);
  if (!layout.ok) return layout;
  const stale =
    before.graph && before.storyboard ? staleBeats(before.graph, graph, before.storyboard) : [];
  const staleNow = [...new Set([...before.project.staleBeats, ...stale])];
  const recheck = before.storyboard ? parseStoryboard(before.storyboard, graph) : undefined;
  const storyboardProblems =
    recheck && !recheck.ok ? formatErrors(inFile("storyboard.json", recheck.errors)) : [];
  const layoutBroken = before.problems.some(
    (p) => p.path === "layout.json" || p.path.startsWith("layout.json:"),
  );
  const warnings = layoutBroken
    ? [
        "layout.json was broken, so the graph was laid out from scratch and any manual positions in it were dropped",
      ]
    : [];
  await writeProjectFile(projectsDir, slug, "graph.json", graph);
  await writeProjectFile(projectsDir, slug, "layout.json", layout.value);
  await writeProjectFile(projectsDir, slug, "project.json", {
    ...before.project,
    staleBeats: staleNow,
    updatedAt: now.toISOString(),
  });
  return ok({ staleBeats: staleNow, storyboardProblems, warnings });
};

/**
 * Saves a graph whose colours alone changed (decision 043): nothing moves and
 * no beat goes stale, so only graph.json and the time are written. The caller
 * holds the project lock and tells listeners.
 */
export const saveColours = async (
  projectsDir: string,
  slug: string,
  before: OpenedProject,
  graph: Graph,
  now: Date,
): Promise<void> => {
  await writeProjectFile(projectsDir, slug, "graph.json", graph);
  await writeProjectFile(projectsDir, slug, "project.json", {
    ...before.project,
    updatedAt: now.toISOString(),
  });
};
