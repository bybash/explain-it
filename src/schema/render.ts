import { z } from "zod";
import { SlugSchema } from "./common.ts";
import { RESOLUTIONS, THEME_MODES } from "./config.ts";

/** A render job's life: queued, then running, then one of the three ends. */
export const RENDER_STATES = ["queued", "running", "done", "failed", "cancelled"] as const;
export const RenderStateSchema = z.enum(RENDER_STATES);

/** A video is one theme; "both" asks for one video of each. */
export const RenderedThemeModeSchema = z.enum(THEME_MODES).exclude(["both"]);

export const JobIdSchema = z.string().min(1).describe("The id of a job that render returned.");

/** What to render. The theme and resolution default to the project's config when the job starts. */
export const RenderRequestSchema = z.strictObject({
  slug: SlugSchema,
  theme: z
    .enum(THEME_MODES)
    .optional()
    .describe("Which theme to render, or both; the project's config by default."),
  resolution: z
    .enum(RESOLUTIONS)
    .optional()
    .describe("The video's resolution; the project's config by default."),
});

/** How far a render has got: frames captured of the current theme, and which theme of how many. */
export const RenderProgressSchema = z.object({
  theme: RenderedThemeModeSchema,
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  themeIndex: z.number().int().nonnegative(),
  themes: z.number().int().positive(),
});

/** The files written for one theme. */
export const RenderedThemeSchema = z.object({
  theme: RenderedThemeModeSchema,
  /** With the narration captions burned in. */
  video: z.string(),
  /** Without them, for players and platforms that show the .srt. */
  clean: z.string(),
  captions: z.string(),
  poster: z.string(),
  /** The soundtrack, when the video has voice or music. */
  audio: z.string().optional(),
});

/** A render job as `render`, `render_status` and the event stream show it. */
export const RenderJobSchema = z.object({
  id: JobIdSchema,
  slug: SlugSchema,
  state: RenderStateSchema,
  request: RenderRequestSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  /** Over the whole job: every theme counts the same. */
  progress: RenderProgressSchema.extend({ percent: z.number().min(0).max(100) }).optional(),
  outputs: z.array(RenderedThemeSchema).optional(),
  error: z.string().optional(),
});

/** On `/api/events`, each time a render job changes. */
export const RenderEventSchema = z.object({
  type: z.literal("render"),
  job: JobIdSchema,
  slug: SlugSchema,
  state: RenderStateSchema,
  percent: z.number().optional(),
});

export type RenderState = z.output<typeof RenderStateSchema>;
export type RenderRequest = z.output<typeof RenderRequestSchema>;
export type RenderProgress = z.output<typeof RenderProgressSchema>;
export type RenderedTheme = z.output<typeof RenderedThemeSchema>;
export type RenderJob = z.output<typeof RenderJobSchema>;
