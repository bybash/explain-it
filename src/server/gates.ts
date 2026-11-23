import type { ValidationError } from "../schema/errors.ts";
import { type Gate, nextGate, type Project } from "../schema/project.ts";
import { openProject, withProjectLock, writeProjectFile } from "./projects.ts";

/** The file a gate's result is in, which must be there and valid to approve the gate. */
const NEEDS: Partial<
  Record<Gate, { readonly file: "graph.json" | "storyboard.json"; readonly what: string }>
> = {
  graph: { file: "graph.json", what: "the graph" },
  script: { file: "storyboard.json", what: "the script" },
};

/** What approving a gate came to; the API answers each kind with its own status. */
export type Approval =
  | { readonly kind: "approved"; readonly project: Project }
  | { readonly kind: "missing" }
  | { readonly kind: "broken"; readonly errors: readonly ValidationError[] }
  | { readonly kind: "refused"; readonly errors: readonly ValidationError[] };

const refused = (path: string, message: string): Approval => ({
  kind: "refused",
  errors: [{ path, message }],
});

/**
 * Approves `gate` and moves the project to the next one. Only the gate the
 * project has reached can be approved, so a second click or an old tab
 * changes nothing: going back to an earlier gate is only a view (SPEC, User
 * flow), and the project keeps the furthest gate it reached. The graph and
 * script gates need their file, valid.
 */
export const approveGate = (
  projectsDir: string,
  slug: string,
  gate: Gate,
  now: Date,
): Promise<Approval> =>
  withProjectLock(projectsDir, slug, async (): Promise<Approval> => {
    const opened = await openProject(projectsDir, slug);
    if (!opened) return { kind: "missing" };
    if (!opened.ok) return { kind: "broken", errors: opened.errors };
    const { project, graph, storyboard } = opened.value;
    if (project.gate !== gate)
      return refused("gate", `the project is at the ${project.gate} gate, not ${gate}`);
    const next = nextGate(gate);
    if (!next) return refused("gate", `${gate} is the last gate`);
    const needs = NEEDS[gate];
    if (needs && !(needs.file === "graph.json" ? graph : storyboard))
      return refused(needs.file, `missing or broken: make ${needs.what} before approving it`);
    const approved: Project = { ...project, gate: next, updatedAt: now.toISOString() };
    await writeProjectFile(projectsDir, slug, "project.json", approved);
    return { kind: "approved", project: approved };
  });
