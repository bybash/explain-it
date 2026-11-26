import { z } from "zod";

/**
 * Messages between a gate's panel and the preview page it shows in an
 * iframe (`preview.html`). The page draws with the same player the renderer
 * captures, in a document of its own, since the player puts the video's
 * theme and font on the page it draws in.
 */

/** The panel asks the page to draw a project, unsaved style and all, and to show one moment of it. */
export const DrawMessageSchema = z.object({
  type: z.literal("draw"),
  graph: z.unknown(),
  storyboard: z.unknown(),
  layout: z.unknown(),
  config: z.unknown(),
  mode: z.enum(["light", "dark"]),
  logo: z.unknown().optional(),
  /** Measured narration by beat, once the voice is made; lines without it are estimated. */
  narration: z.unknown().optional(),
  at: z.number().min(0),
});
export type DrawMessage = z.output<typeof DrawMessageSchema>;

export const SeekMessageSchema = z.object({ type: z.literal("seek"), at: z.number().min(0) });

export const ToPreviewSchema = z.discriminatedUnion("type", [DrawMessageSchema, SeekMessageSchema]);
export type ToPreview = z.output<typeof ToPreviewSchema>;

/** A beat's place in the video, as the player plans it. */
export const BeatSpanSchema = z.object({
  id: z.string(),
  scene: z.string(),
  start: z.number(),
  end: z.number(),
});
export type BeatSpan = z.output<typeof BeatSpanSchema>;

/** A moment worth jumping to: the title card, a beat, the end. */
/** A place to seek to: the title, a beat (with its scene) or the end. */
export const MarkSchema = z.object({
  label: z.string(),
  at: z.number().min(0),
  scene: z.string().optional(),
});
export type Mark = z.output<typeof MarkSchema>;

/** The page answers each drawing with the video's length and its marks, or with what was wrong. */
export const FromPreviewSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("drawn"),
    duration: z.number(),
    marks: z.array(MarkSchema),
    /** Each beat's place in the video, for a beat list. */
    beats: z.array(BeatSpanSchema),
  }),
  z.object({ type: z.literal("failed"), message: z.string() }),
]);
export type FromPreview = z.output<typeof FromPreviewSchema>;
