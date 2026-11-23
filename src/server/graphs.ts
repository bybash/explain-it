import { laidOut } from "../mcp/edits.ts";
import { inFile } from "../render/load.ts";
import type { OpenedProject } from "../schema/api.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import { ok } from "../schema/result.ts";
import { staleBeats } from "../schema/stale.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { writeProjectFile } from "./projects.ts";

/** What saving a graph did to the rest of the project. */
export type SavedGraph = {
  /** Every beat now stale: those this edit touched, and those already stale. */
  readonly staleBeats: readonly string[];
  /** What the storyboard no longer agrees with, such as a beat naming a removed node. */
  readonly storyboardProblems: readonly string[];
  readonly warnings: readonly string[];
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
): Promise<Validated<SavedGraph>> => {
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
