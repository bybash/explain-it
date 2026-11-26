import { scriptProblems } from "../checks/story.ts";
import { projectBeats } from "../engine/beats/build.ts";
import { graphGuide, storyboardGuide } from "../guidance/guide.ts";
import { edited } from "../mcp/edits.ts";
import type { Config } from "../schema/config.ts";
import {
  type Edit,
  EditSchema,
  type GraphDraft,
  GraphDraftSchema,
  type ScriptDraft,
  ScriptDraftSchema,
} from "../schema/drafts.ts";
import { under, type Validated, type ValidationError } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { fail, ok } from "../schema/result.ts";
import type { Brief } from "../schema/story.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import type { LlmClient } from "./client.ts";
import { prompt } from "./prompts.ts";
import { structuredCall, structuredDraft } from "./structured.ts";

/** A file of context the user gave, by name, with its text. */
export type ContextText = { readonly name: string; readonly text: string };

/** What a draft is made from: the user's description, the context it names, and the house rules. */
export type DraftInput = {
  readonly request: string;
  readonly context: readonly ContextText[];
  readonly houseRules?: string | null;
};

/** The user's message to the drafting call: the context first, then what to draft. */
const asked = ({ request, context }: DraftInput) =>
  [
    ...context.map((c) => `Context file "${c.name}":\n\n${c.text}`),
    `Draft graph.json for this:\n\n${request}`,
  ].join("\n\n---\n\n");

/**
 * Drafts graph.json (5.3) in one structured call, with the repair loop: an
 * answer whose graph does not hold together (a reference to nothing, a
 * duplicate id) is sent back with its errors, as one that asks more than
 * `MAX_QUESTIONS` is. The prompt is built from the authoring guide.
 */
export const draftGraph = async (
  client: LlmClient,
  input: DraftInput,
): Promise<Validated<GraphDraft>> => {
  const drafted = await structuredCall(client, {
    name: "draft-graph",
    system: prompt("draft-graph", { guide: graphGuide(input.houseRules ?? null) }),
    prompt: asked(input),
    schema: GraphDraftSchema,
    check: (draft) => {
      const graph = parseGraph(draft.graph);
      return graph.ok ? ok({ ...draft, graph: graph.value }) : fail(under("graph", graph.errors));
    },
  });
  return drafted;
};

/** What a script is drafted from, besides the request: the approved graph, the brief, and the style that times it. */
export type ScriptInput = DraftInput & {
  readonly graph: Graph;
  readonly brief: Brief | null;
  readonly config: Config;
};

/**
 * Drafts storyboard.json (5.4) for the graph, following the brief, in one
 * structured call. An answer that does not fit the graph is sent back, as
 * is one the story checks (2.8) or the quick checks find fault with; when
 * the repairs run out, the last script that fits the graph is kept, with
 * what is left, so the agent can say it or fix it.
 */
export const draftScript = async (
  client: LlmClient,
  input: ScriptInput,
): Promise<Validated<{ draft: ScriptDraft; remaining: readonly ValidationError[] }>> => {
  const { graph, brief, config } = input;
  const drafted = await structuredDraft(client, {
    name: "draft-script",
    system: prompt("draft-script", { guide: storyboardGuide(input.houseRules ?? null) }),
    prompt: [
      ...input.context.map((c) => `Context file "${c.name}":\n\n${c.text}`),
      `The approved graph.json:\n\n${JSON.stringify(graph)}`,
      brief ? `The approved brief.json:\n\n${JSON.stringify(brief)}` : "There is no brief yet.",
      `Write storyboard.json for this:\n\n${input.request}`,
    ].join("\n\n---\n\n"),
    schema: ScriptDraftSchema,
    check: (draft) => {
      const storyboard = parseStoryboard(draft.storyboard, graph);
      return storyboard.ok
        ? ok({ ...draft, storyboard: storyboard.value })
        : fail(under("storyboard", storyboard.errors));
    },
    improve: (draft) =>
      under(
        "storyboard",
        scriptProblems(
          projectBeats({ storyboard: draft.storyboard, graph, config }),
          draft.storyboard,
        ),
      ),
  });
  return drafted.ok
    ? ok({ draft: drafted.value.value, remaining: drafted.value.remaining })
    : drafted;
};

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
    prompt: [
      ...(input.file === "storyboard"
        ? [`The graph.json it tells:\n\n${JSON.stringify(input.graph)}`]
        : []),
      `The current ${input.file}.json:\n\n${JSON.stringify(current)}`,
      `The change the user asked for:\n\n${input.request}`,
    ].join("\n\n---\n\n"),
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
