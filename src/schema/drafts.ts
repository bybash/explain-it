import { z } from "zod";
import { MAX_CHAT_MESSAGE } from "./chat.ts";
import { GraphSchema } from "./graph.ts";

/** The drafting tools only the app's assistant has: an IDE's agent is the LLM, and drafts itself. */
export const DRAFT_TOOL_NAMES = { draftGraph: "draft_graph" } as const;

/** The most questions a draft may ask: it drafts right away and states what it assumed (SPEC, User flow). */
export const MAX_QUESTIONS = 2;
/** The most assumptions a draft lists, so the user reads them all. */
export const MAX_ASSUMPTIONS = 5;

const Assumptions = z
  .array(z.string().min(1).max(200))
  .max(MAX_ASSUMPTIONS)
  .describe("What you assumed where the description left it open, each in a sentence.");
const Questions = z
  .array(z.string().min(1).max(200))
  .max(MAX_QUESTIONS)
  .describe(
    `At most ${MAX_QUESTIONS} questions whose answers would change the draft; none when nothing would.`,
  );

/** A drafted graph (5.3): the graph, and what the user should hear about it. */
export const GraphDraftSchema = z.strictObject({
  graph: GraphSchema,
  assumptions: Assumptions,
  questions: Questions,
});
export type GraphDraft = z.output<typeof GraphDraftSchema>;

/** What the assistant asks a drafting tool for: the user's description, and the context files that bear on it. */
export const DraftArgsSchema = z.strictObject({
  request: z
    .string()
    .min(1)
    .max(MAX_CHAT_MESSAGE)
    .describe("What to draft: the flow as the user described it, with anything agreed since."),
  context: z
    .array(z.string())
    .default([])
    .describe("The names of the context files to draft from, as listed under Context."),
});
export type DraftArgs = z.output<typeof DraftArgsSchema>;
