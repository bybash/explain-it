import type { OpenedProject } from "../schema/api.ts";
import type { Validated } from "../schema/errors.ts";
import { laterGate } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import { writeProjectFile } from "./projects.ts";

/** Each beat as JSON by id, to tell which beats a new storyboard rewrote. */
const beatsById = (storyboard: Storyboard | null) =>
  new Map((storyboard?.scenes ?? []).flatMap((s) => s.beats).map((b) => [b.id, JSON.stringify(b)]));

/** Why a storyboard cannot be saved yet: there is no graph for it to tell. */
export const NO_GRAPH = { path: "graph.json", message: "missing; make the graph first" };

/**
 * Saves a storyboard over a project's own (SPEC, User flow): checked against
 * the graph, it clears the stale beats it rewrote (a beat left exactly as it
 * was stays stale) and moves the project on to the script gate. MCP's
 * `set_storyboard` and the Script gate's editor both save this way. The
 * caller holds the project lock and tells listeners.
 */
export const saveStoryboard = async (
  projectsDir: string,
  before: OpenedProject,
  data: unknown,
  now: Date,
): Promise<Validated<{ storyboard: Storyboard; staleBeats: string[] }>> => {
  if (!before.graph) return fail([NO_GRAPH]);
  const storyboard = parseStoryboard(data, before.graph);
  if (!storyboard.ok) return storyboard;
  const previous = beatsById(before.storyboard);
  const rewritten = beatsById(storyboard.value);
  const staleBeats = before.project.staleBeats.filter(
    (id) => rewritten.has(id) && rewritten.get(id) === previous.get(id),
  );
  await writeProjectFile(projectsDir, before.slug, "storyboard.json", storyboard.value);
  await writeProjectFile(projectsDir, before.slug, "project.json", {
    ...before.project,
    staleBeats,
    gate: laterGate(before.project.gate, "script"),
    updatedAt: now.toISOString(),
  });
  return ok({ storyboard: storyboard.value, staleBeats });
};
