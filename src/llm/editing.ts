import { graphGuide, storyboardGuide } from "../guidance/guide.ts";
import { type Edit, EditSchema, type LayoutRepair, LayoutRepairSchema } from "../schema/drafts.ts";
import { under, type Validated } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { edited } from "../schema/json-patch.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import type { LlmClient } from "./client.ts";
import { prompt, promptParts } from "./prompts.ts";
import { structuredCall } from "./structured.ts";

/** What an edit changes: the graph, or the script of that graph. */
export type EditInput = {
  readonly request: string;
  readonly graph: Graph;
  readonly houseRules?: string | null;
} & ({ readonly file: "graph" } | { readonly file: "storyboard"; readonly storyboard: Storyboard });

/** A JSON Patch step, with its value read back from the JSON text the answer gives. */
type PatchStep = {
  readonly op: string;
  readonly path: string;
  readonly from?: string | undefined;
  readonly value?: unknown;
};

/** The answer's patch as a real one: each value read from its JSON text, or an error at its place. */
const decoded = (patch: Edit["patch"]): Validated<PatchStep[]> => {
  const steps: PatchStep[] = [];
  for (const [i, { value, ...step }] of patch.entries()) {
    if (value === undefined) {
      steps.push(step);
      continue;
    }
    try {
      steps.push({ ...step, value: JSON.parse(value) });
    } catch {
      return fail([
        { path: `patch[${i}].value`, message: "not JSON text; write the value as JSON" },
      ]);
    }
  }
  return ok(steps);
};

/** A file with a patch applied, checked as the file is: errors are named under the patch. */
const patched = (
  input: EditInput,
  patch: Edit["patch"],
): Validated<{ steps: PatchStep[]; result: Graph | Storyboard }> => {
  const steps = decoded(patch);
  if (!steps.ok) return steps;
  const current = input.file === "graph" ? input.graph : input.storyboard;
  const next = edited(input.file, current, undefined, steps.value);
  if (!next.ok) return next;
  const parsed =
    input.file === "graph" ? parseGraph(next.value) : parseStoryboard(next.value, input.graph);
  return parsed.ok
    ? ok({ steps: steps.value, result: parsed.value })
    : fail(under(input.file, parsed.errors));
};

/**
 * An edit the user asked for in the chat (5.5): one structured call that
 * answers with a JSON Patch on the current file, so everything it does not
 * touch stays as it was. A patch that does not apply, or leaves a file that
 * does not hold together, is sent back with its errors. Gives the patch and
 * the file it makes.
 */
export const editFile = async (
  client: LlmClient,
  input: EditInput,
): Promise<
  Validated<{
    readonly patch: readonly PatchStep[];
    readonly summary: string;
    readonly result: Graph | Storyboard;
  }>
> => {
  const current = input.file === "graph" ? input.graph : input.storyboard;
  const guide =
    input.file === "graph"
      ? graphGuide(input.houseRules ?? null)
      : storyboardGuide(input.houseRules ?? null);
  const answer = await structuredCall(client, {
    name: `edit-${input.file}`,
    system: prompt("edit", { file: input.file, guide }),
    prompt: promptParts([
      ...(input.file === "storyboard"
        ? [`The graph.json it tells:\n\n${JSON.stringify(input.graph)}`]
        : []),
      `The current ${input.file}.json:\n\n${JSON.stringify(current)}`,
      `The change the user asked for:\n\n${input.request}`,
    ]),
    schema: EditSchema,
    check: (edit) => {
      const result = patched(input, edit.patch);
      return result.ok ? ok(edit) : result;
    },
  });
  if (!answer.ok) return answer;
  const done = patched(input, answer.value.patch);
  return done.ok
    ? ok({ patch: done.value.steps, summary: answer.value.summary, result: done.value.result })
    : done;
};

/** What a layout repair works on: the files, and what the checks found in plain words. */
export type RepairInput = {
  readonly graph: Graph;
  readonly storyboard: Storyboard;
  readonly problems: readonly string[];
  readonly houseRules?: string | null;
};

/** The files a repair makes: its labels on the graph, then its patch on the script, each read as the file is. */
const repaired = (
  input: RepairInput,
  repair: LayoutRepair,
): Validated<{ graph: Graph; storyboard: Storyboard }> => {
  if (repair.labels.length === 0 && repair.storyboardPatch.length === 0)
    return fail([
      {
        path: "(answer)",
        message: "changes nothing; shorten a label or move nodes to another scene",
      },
    ]);
  const labels = new Map(repair.labels.map((l) => [l.id, l.label]));
  const known = new Set([
    ...input.graph.nodes.map((n) => n.id),
    ...input.graph.edges.map((e) => e.id),
    ...(input.graph.zones ?? []).map((z) => z.id),
  ]);
  const unknown = repair.labels.findIndex((l) => !known.has(l.id));
  if (unknown >= 0)
    return fail([
      {
        path: `labels[${unknown}].id`,
        message: `no node, edge or zone "${repair.labels[unknown]?.id}"`,
      },
    ]);
  const relabel = <T extends { readonly id: string; readonly label?: string | undefined }>(
    item: T,
  ): T => {
    const label = labels.get(item.id);
    return label === undefined ? item : { ...item, label };
  };
  const graph = parseGraph({
    ...input.graph,
    nodes: input.graph.nodes.map(relabel),
    edges: input.graph.edges.map(relabel),
    ...(input.graph.zones ? { zones: input.graph.zones.map(relabel) } : {}),
  });
  if (!graph.ok) return fail(under("graph", graph.errors));
  if (repair.storyboardPatch.length === 0)
    return ok({ graph: graph.value, storyboard: input.storyboard });
  const steps = decoded(repair.storyboardPatch);
  if (!steps.ok) return fail(under("storyboardPatch", steps.errors));
  const next = edited("storyboard", input.storyboard, undefined, steps.value);
  if (!next.ok) return fail(under("storyboardPatch", next.errors));
  const storyboard = parseStoryboard(next.value, graph.value);
  return storyboard.ok
    ? ok({ graph: graph.value, storyboard: storyboard.value })
    : fail(under("storyboard", storyboard.errors));
};

/**
 * A repair of what the layout engine could not fix (5.6): one structured
 * call that answers with shorter labels and scene changes, never a box's
 * place. An answer that names what is not there, or leaves files that do
 * not hold together, is sent back. Gives the files it makes, to be offered
 * as a fix; the checks that run after say whether it worked.
 */
export const repairLayout = async (
  client: LlmClient,
  input: RepairInput,
): Promise<Validated<{ graph: Graph; storyboard: Storyboard; summary: string }>> => {
  const answer = await structuredCall(client, {
    name: "repair-layout",
    system: prompt("repair-layout", {
      guide: [graphGuide(input.houseRules ?? null), storyboardGuide()].join("\n\n"),
    }),
    prompt: promptParts([
      `What the checks found:\n\n${input.problems.map((p) => `- ${p}`).join("\n")}`,
      `The current graph.json:\n\n${JSON.stringify(input.graph)}`,
      `The current storyboard.json:\n\n${JSON.stringify(input.storyboard)}`,
    ]),
    schema: LayoutRepairSchema,
    check: (repair) => {
      const files = repaired(input, repair);
      return files.ok ? ok(repair) : files;
    },
  });
  if (!answer.ok) return answer;
  const files = repaired(input, answer.value);
  return files.ok ? ok({ ...files.value, summary: answer.value.summary }) : files;
};
