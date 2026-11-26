import { z } from "zod";
import { IdSchema } from "./common.ts";
import { GraphSchema } from "./graph.ts";
import { FloorPointSchema } from "./layout.ts";
import { MAX_CAPTION, MAX_SAY } from "./storyboard.ts";

/**
 * Fixes for what the checks find (SPEC, LLM: checks become fixes; decision
 * 038). Each says exactly what it changes, so it can be applied, said, and
 * undone, each as its state before and after. A fix to the user's words is
 * offered; one to the layout is applied at once.
 */
/** The words of a beat a fix can shorten, and what the chat calls each. */
export const WORD_FIELDS = ["caption", "say"] as const;
export type WordField = (typeof WORD_FIELDS)[number];
export const WORD_FIELD_NAMES: Readonly<Record<WordField, string>> = {
  caption: "caption",
  say: "line",
};

/** The LLM's answer when asked for shorter words: the words again, within the field's own limit. */
export const shorterWordsSchema = (field: WordField) =>
  z.strictObject({
    text: z
      .string()
      .min(1)
      .max(field === "caption" ? MAX_CAPTION : MAX_SAY),
  });

export const FixSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("words"),
    beat: IdSchema,
    field: z.enum(WORD_FIELDS),
    before: z.string(),
    after: z.string(),
  }),
  /**
   * The hand-placed positions of the nodes it changes, before and after; a
   * node missing from `after` is laid out again. Other nodes are left as
   * they are, and do not stop it being undone.
   */
  /**
   * A repair of the layout (5.6): files rewritten whole, before and after, as
   * the LLM proposed (shorter labels, a crowded scene split). Never a box
   * moved by coordinates.
   */
  z.strictObject({
    kind: z.literal("rewrite"),
    // The script is read against the graph it goes with, so its shape is checked where it is applied.
    before: z.strictObject({ graph: GraphSchema.optional(), storyboard: z.unknown().optional() }),
    after: z.strictObject({ graph: GraphSchema.optional(), storyboard: z.unknown().optional() }),
  }),
  z.strictObject({
    kind: z.literal("layout"),
    before: z.record(IdSchema, FloorPointSchema),
    after: z.record(IdSchema, FloorPointSchema),
  }),
]);
export type Fix = z.output<typeof FixSchema>;

/** Whether a fix waits for the user, or is applied as it is found. */
export const isAutomatic = (fix: Fix): boolean => fix.kind === "layout";

/** A fix as the chat offers it: an id to apply it by, and what it does in a few words. */
export const FixOfferSchema = z.strictObject({
  id: z.string().regex(/^fix-[0-9a-z-]+$/),
  label: z.string().min(1),
  fix: FixSchema,
});
export type FixOffer = z.output<typeof FixOfferSchema>;

/** A fix applied or undone, as the chat keeps it; undoing applies its inverse. */
export const FixDoneSchema = z.strictObject({
  id: FixOfferSchema.shape.id,
  done: z.enum(["applied", "undone"]),
});
export type FixDone = z.output<typeof FixDoneSchema>;
