import { z } from "zod";
import { MAX_CHAT_MESSAGE } from "./chat.ts";
import { TitleCardSchema } from "./config.ts";
import { GraphSchema } from "./graph.ts";
import { StoryboardSchema } from "./storyboard.ts";

/** The drafting tools only the app's assistant has: an IDE's agent is the LLM, and drafts itself. */
export const DRAFT_TOOL_NAMES = {
  draftGraph: "draft_graph",
  draftScript: "draft_script",
  editGraph: "edit_graph",
  editScript: "edit_script",
} as const;

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

/** A drafted script (5.4): the storyboard, a title card to suggest, and what it assumed. */
export const ScriptDraftSchema = z.strictObject({
  storyboard: StoryboardSchema,
  titleCard: TitleCardSchema.describe(
    "A title card to suggest: the video's name, and a line under it.",
  ),
  assumptions: Assumptions,
});
export type ScriptDraft = z.output<typeof ScriptDraftSchema>;

/** A JSON Patch step whose value is JSON text, as structured output takes no field of any type. */
const PatchStepSchema = z.strictObject({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string().describe('A JSON Pointer, such as "/nodes/2/label".'),
  from: z.string().optional().describe("For move and copy: where from."),
  value: z
    .string()
    .optional()
    .describe(
      'For add, replace and test: the value as JSON text, such as "\\"Google\\"" or "{\\"id\\": \\"retry\\"}".',
    ),
});

/**
 * An edit the user asked for (5.5): a JSON Patch on the file, and what it
 * changed in a sentence. Each value is JSON text, as structured output takes
 * no field of any type; the code reads it back into the patch.
 */
export const EditSchema = z.strictObject({
  patch: z
    .array(PatchStepSchema)
    .min(1)
    .describe("An RFC 6902 JSON Patch on the current file, each value written as JSON text."),
  summary: z.string().min(1).max(200).describe("What the patch changes, in a sentence."),
});
export type Edit = z.output<typeof EditSchema>;

/** What the assistant asks an editing tool for: the change, as the user asked it. */
export const EditArgsSchema = z.strictObject({
  request: z
    .string()
    .min(1)
    .max(MAX_CHAT_MESSAGE)
    .describe(
      'The change, as the user asked it: "rename X", "add a retry step", "shorten beat 3".',
    ),
});

/**
 * A repair of the layout (5.6) for what the layout engine could not fix: new
 * labels by id, and a patch on the script's scenes, so fewer things share a
 * frame. Labels are all it may change in the graph: never an id, never a
 * box's place.
 */
export const LayoutRepairSchema = z.strictObject({
  labels: z
    .array(
      z.strictObject({
        id: z.string().describe("A node, edge or zone id, as it is."),
        label: z.string().min(1).describe("Its new, shorter label."),
      }),
    )
    .describe("Shorter labels, by id; none when the scenes alone fix it."),
  storyboardPatch: z
    .array(PatchStepSchema)
    .describe(
      "A JSON Patch on storyboard.json moving nodes or beats to another scene or a new one; empty when the labels alone fix it.",
    ),
  summary: z.string().min(1).max(200).describe("What the repair changes, in a sentence."),
});
export type LayoutRepair = z.output<typeof LayoutRepairSchema>;

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
