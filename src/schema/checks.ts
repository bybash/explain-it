import { z } from "zod";
import { IdSchema } from "./common.ts";

/** The stage, in pixels: every frame is drawn at this size and scaled down for 720p. */
export const STAGE = { width: 1920, height: 1080 } as const;
/** SPEC, Checks: the safe area's margin, as a share of each side of the frame. */
export const SAFE_MARGIN = 0.05;
/** SPEC, Checks: two shapes may overlap by this much (how far they must move apart) before it counts. */
export const OVERLAP_PX = 4;

/** A point on the stage, in pixels (1920 × 1080). */
export const PointSchema = z.object({ x: z.number(), y: z.number() });
const Polygon = z.array(PointSchema).min(2);

export const OVERLAY_ROLES = [
  "title",
  "step",
  "narration",
  "callout",
  "badge",
  "edge-label",
  "logo",
] as const;

/**
 * One thing drawn on the stage at a moment, as the render page reports it
 * (`__shapes()`): where it is, and what it belongs to, so the checks know
 * which overlaps are meant (a node on its own zone, a callout on its node).
 */
export const ShapeSchema = z.discriminatedUnion("kind", [
  /** A node's box, as its faces. */
  z.object({
    kind: z.literal("node"),
    id: IdSchema,
    zone: IdSchema.optional(),
    faces: z.array(Polygon).min(1),
  }),
  /** A zone's platform. */
  z.object({ kind: z.literal("zone"), id: IdSchema, polygon: Polygon }),
  z.object({ kind: z.literal("zone-label"), zone: IdSchema, polygon: Polygon }),
  /** An edge's line, as drawn so far. */
  z.object({
    kind: z.literal("edge"),
    id: IdSchema,
    from: IdSchema,
    to: IdSchema,
    points: Polygon,
  }),
  z.object({
    kind: z.literal("overlay"),
    role: z.enum(OVERLAY_ROLES),
    /** The node a callout or badge points at, or the edge a label names. */
    node: IdSchema.optional(),
    edge: IdSchema.optional(),
    polygon: Polygon,
  }),
]);

export const CHECKS = ["overlap", "off-frame"] as const;

/** One problem the checks found, at the beat it shows in. */
export const CheckWarningSchema = z.object({
  check: z.enum(CHECKS),
  scene: IdSchema,
  beat: IdSchema,
  /** Seconds into the video: the beat's midpoint. */
  at: z.number(),
  /** By how many pixels: overlap depth, line inside a box, or distance past the safe area. */
  px: z.number(),
  message: z.string(),
});

/** The checks' report, `checks.json` in the project's folder (SPEC, Checks). */
export const CheckReportSchema = z.strictObject({
  version: z.literal(1),
  checkedAt: z.iso.datetime(),
  beats: z.int().nonnegative(),
  warnings: z.array(CheckWarningSchema),
});

export type Shape = z.output<typeof ShapeSchema>;
export type CheckWarning = z.output<typeof CheckWarningSchema>;
export type CheckReport = z.output<typeof CheckReportSchema>;

/** A beat's place in the video, as the render page reports it (`__beats`). */
export const BeatSpanSchema = z.object({
  id: IdSchema,
  scene: IdSchema,
  start: z.number(),
  end: z.number(),
});
