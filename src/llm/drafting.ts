import { graphGuide } from "../guidance/guide.ts";
import { type GraphDraft, GraphDraftSchema } from "../schema/drafts.ts";
import { under, type Validated } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient } from "./client.ts";
import { prompt } from "./prompts.ts";
import { structuredCall } from "./structured.ts";

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
