import { z } from "zod";
import { IdSchema } from "./common.ts";

/** The stage, in pixels: every frame is drawn at this size and scaled down for 720p. */
export const STAGE = { width: 1920, height: 1080 } as const;
/** SPEC, Checks: the safe area's margin, as a share of each side of the frame. */
export const SAFE_MARGIN = 0.05;
/** SPEC, Checks: two shapes may overlap by this much (how far they must move apart) before it counts. */
export const OVERLAP_PX = 4;

/**
 * SPEC, Checks: how many characters a second a caption may ask of a viewer.
 * Step captions are read alone; narration captions are subtitles of speech
 * also heard, so they use the common subtitle limit (decision 017).
 */
export const READING_SPEED = { step: 15, narration: 17 } as const;
/** SPEC, Checks: the most a line may need speeding up to fit its beat. */
export const NARRATION_FIT = 1.05;
/** SPEC, Mix and Checks: the mix's integrated loudness and its tolerance, in LUFS, and its highest true peak, in dBTP. */
export const LOUDNESS = { target: -16, tolerance: 1, maxTruePeak: -1 } as const;

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

/** The checks that find a problem at a beat. */
export const BEAT_CHECKS = ["overlap", "off-frame", "reading-speed", "narration-fit"] as const;
/** The checks that judge the whole video. */
export const VIDEO_CHECKS = ["loudness"] as const;
export const CHECKS = [...BEAT_CHECKS, ...VIDEO_CHECKS] as const;

/** One problem the checks found: at the beat it shows in, or (loudness) for the whole video. */
export const CheckWarningSchema = z.union([
  z.strictObject({
    check: z.enum(BEAT_CHECKS),
    scene: IdSchema,
    beat: IdSchema,
    /** Seconds into the video where it shows. */
    at: z.number(),
    /** For a layout problem, by how many pixels: overlap depth, line inside a box, or distance past the safe area. */
    px: z.number().optional(),
    message: z.string(),
  }),
  z.strictObject({ check: z.enum(VIDEO_CHECKS), message: z.string() }),
]);

/** Checks that could not run this time, and why (a program missing, the voice failed). */
export const SkippedChecksSchema = z.strictObject({
  checks: z.array(z.enum(CHECKS)).min(1),
  reason: z.string(),
});

/** The checks' report, `checks.json` in the project's folder (SPEC, Checks). */
export const CheckReportSchema = z.strictObject({
  version: z.literal(1),
  checkedAt: z.iso.datetime(),
  beats: z.int().nonnegative(),
  warnings: z.array(CheckWarningSchema),
  skipped: z.array(SkippedChecksSchema).default([]),
});

export type Shape = z.output<typeof ShapeSchema>;
export type CheckWarning = z.output<typeof CheckWarningSchema>;
export type CheckReport = z.output<typeof CheckReportSchema>;
export type SkippedChecks = z.output<typeof SkippedChecksSchema>;
/** A warning at a beat: everything but loudness. */
export type BeatWarning = Extract<CheckWarning, { readonly beat: string }>;

/** A beat's place in the video, as the render page reports it (`__beats`). */
export const BeatSpanSchema = z.object({
  id: IdSchema,
  scene: IdSchema,
  start: z.number(),
  end: z.number(),
});
