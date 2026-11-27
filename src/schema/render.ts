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

/** Each file a render writes in a theme's folder, `out/<time>/<theme>/` (SPEC, Rendering). */
export const RENDER_FILES = {
  video: "video.mp4",
  clean: "video-clean.mp4",
  captions: "captions.srt",
  audio: "audio.wav",
  poster: "poster.png",
  contactSheet: "contact-sheet.png",
  gif: "scene.gif",
} as const;

/**
 * The GIF of one scene a render makes (decision 052): short enough to play
 * through in a chat or a pull request, and small enough to attach to one.
 */
export const GIF_LIMITS = {
  /** The longest clip, in seconds. */
  seconds: 15,
  /** The size it aims under: GitHub's and Slack's limits for an image that plays inline. */
  bytes: 5 * 1024 * 1024,
  /** The colours in its palette, made for the clip. */
  colours: 128,
} as const;

/**
 * The GIF's sizes, tried in order until one is under `GIF_LIMITS.bytes`
 * (decision 052): each smaller in width or frame rate than the one before.
 */
export const GIF_SIZES = [
  { width: 720, fps: 12 },
  { width: 640, fps: 10 },
  { width: 480, fps: 8 },
  { width: 400, fps: 6 },
] as const;
export type RenderFile = keyof typeof RENDER_FILES;

/** How each of a render's files is served. */
export const RENDER_FILE_TYPES: Readonly<Record<RenderFile, string>> = {
  video: "video/mp4",
  clean: "video/mp4",
  captions: "application/x-subrip",
  audio: "audio/wav",
  poster: "image/png",
  contactSheet: "image/png",
  gif: "image/gif",
};

/** Written into `out/<time>/` once every theme is: a folder without it is not a finished render. */
export const RENDER_MANIFEST = "render.json";

/** What a render is doing: speaking its voice, mixing its sound, capturing frames, or finishing its files. */
export const RenderStepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("voice"), spoken: z.int().min(0), total: z.int().min(0) }),
  z.object({ step: z.literal("mix") }),
  z.object({ step: z.literal("frames") }),
  z.object({ step: z.literal("finishing") }),
]);

/** The files written for one theme. */
export const RenderedThemeSchema = z.object({
  theme: RenderedThemeModeSchema,
  /** With the narration captions burned in. */
  video: z.string(),
  /** Without them, for players and platforms that show the .srt. */
  clean: z.string(),
  captions: z.string(),
  poster: z.string(),
  /** One still per beat on one image. */
  contactSheet: z.string(),
  /** One scene as a GIF, captions burned in, no sound (decision 052). */
  gif: z.string(),
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
  /** Its folder in the project's `out/`, once the render has started writing it. */
  stamp: z.string().optional(),
  /** What it is doing now; the frames' progress is `progress`. */
  step: RenderStepSchema.optional(),
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

/** A render's folder name: the time it started, to the millisecond, made safe for a path. */
export const renderStamp = (now: Date): string => now.toISOString().replaceAll(":", "-");

/** The timestamp folder a render writes into: `out/<time>/`, named by `renderStamp`. */
export const RenderStampSchema = z
  .string()
  .regex(
    /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z$/,
    "a render's folder, such as 2026-11-23T10-00-00.000Z",
  );

/**
 * `out/<time>/render.json`, written once every theme is: what was rendered.
 * A folder without one is a render still running, or one that stopped.
 */
export const RenderManifestSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  resolution: z.enum(RESOLUTIONS),
  themes: z.array(RenderedThemeModeSchema).min(1),
  /** The video's length. */
  seconds: z.number().nonnegative(),
});

/** A finished render as the Render gate lists it: its folder, what it is, and each theme's files with their sizes. */
export const RenderedFolderSchema = RenderManifestSchema.omit({ version: true }).extend({
  stamp: RenderStampSchema,
  files: z.array(
    z.object({
      theme: RenderedThemeModeSchema,
      file: z.enum(Object.keys(RENDER_FILES) as [RenderFile, ...RenderFile[]]),
      name: z.enum(Object.values(RENDER_FILES) as [string, ...string[]]),
      bytes: z.int().nonnegative(),
    }),
  ),
});

export type RenderState = z.output<typeof RenderStateSchema>;
export type RenderStep = z.output<typeof RenderStepSchema>;
export type RenderManifest = z.output<typeof RenderManifestSchema>;
export type RenderedFolder = z.output<typeof RenderedFolderSchema>;
export type RenderRequest = z.output<typeof RenderRequestSchema>;
export type RenderProgress = z.output<typeof RenderProgressSchema>;
export type RenderedTheme = z.output<typeof RenderedThemeSchema>;
export type RenderJob = z.output<typeof RenderJobSchema>;
