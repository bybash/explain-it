import { z } from "zod";
import { IdSchema } from "./common.ts";
import { FloorPointSchema } from "./layout.ts";

/**
 * Fixes for what the checks find (SPEC, LLM: checks become fixes; decision
 * 038). Each says exactly what it changes, so it can be applied, said, and
 * undone, each as its state before and after. A fix to the user's words is
 * offered; one to the layout is applied at once.
 */
export const FixSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("words"),
    beat: IdSchema,
    field: z.enum(["caption", "say"]),
    before: z.string(),
    after: z.string(),
  }),
  /** The hand-placed positions, before and after: dropping some lays those nodes out again. */
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
