import { z } from "zod";
import { CheckReportSchema } from "./checks.ts";
import { SlugSchema } from "./common.ts";
import {
  BYTES_PER_MB,
  ConfigSchema,
  LOGO_CORNERS,
  LOGO_MAX_BYTES,
  LOGO_SHOWS,
  LogoImagesSchema,
  MusicSchema,
  VoiceSchema,
} from "./config.ts";
import { ValidationErrorSchema } from "./errors.ts";
import { GraphSchema } from "./graph.ts";
import { LayoutSchema } from "./layout.ts";
import { NarrationSchema } from "./narration.ts";
import { GATES, ProjectSchema } from "./project.ts";
import {
  RenderEventSchema,
  RenderedFolderSchema,
  RenderJobSchema,
  RenderRequestSchema,
} from "./render.ts";
import { BriefSchema, HouseRulesSchema } from "./story.ts";
import { StoryboardSchema } from "./storyboard.ts";

/** The projects API's requests and responses: the server sends these shapes and the web app checks them. */

/** Every error response: what is wrong, each naming its place. */
export const ErrorsResponseSchema = z.object({ errors: z.array(ValidationErrorSchema) });

/** `POST /api/projects/:slug/approve`: the gate the user approves, which must be the one reached. */
export const ApproveSchema = z.strictObject({ gate: z.enum(GATES) });
export const ApprovedSchema = z.object({ project: ProjectSchema });

/** The longest Mermaid the graph editor sends: far more than the most nodes a graph may have need. */
export const MAX_MERMAID = 20_000;

/** `POST /api/projects/:slug/graph/read` and `PUT /api/projects/:slug/graph`: the edited Mermaid. */
export const GraphEditSchema = z.strictObject({ mermaid: z.string().max(MAX_MERMAID) });
export type GraphEdit = z.output<typeof GraphEditSchema>;

/** What the Mermaid reads as: the graph, and notes on what it leaves out. */
export const GraphReadSchema = z.object({ graph: GraphSchema, notes: z.array(z.string()) });

/** A saved graph: as read, its Mermaid written again, and what the save did to the project. */
export const GraphSavedSchema = z.object({
  ...GraphReadSchema.shape,
  mermaid: z.string(),
  staleBeats: z.array(z.string()),
  storyboardProblems: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type GraphSaved = z.output<typeof GraphSavedSchema>;
/** What saving a graph did to the rest of the project. */
export type GraphSaveOutcome = Pick<GraphSaved, "staleBeats" | "storyboardProblems" | "warnings">;

/** Where the API serves the bundled fonts, which the preview loads as the renderer does. */
export const FONTS_PATH = "/api/fonts/";

/** What a voice sample says when the script has no narration yet. */
export const SAMPLE_LINE = "This is how the narration of your video will sound.";
/** How long a music sample lasts, in seconds: enough to hear the mood. */
export const MUSIC_SAMPLE_SECONDS = 15;

/** `GET /api/projects/:slug/samples/voice`: the voice and speed to speak the sample in. */
export const VoiceSampleQuerySchema = z.strictObject({
  voice: VoiceSchema.shape.id.unwrap(),
  speed: z.coerce.number().pipe(VoiceSchema.shape.speed.unwrap()),
});

/** `GET /api/samples/music`: the music to play a few seconds of. */
export const MusicSampleQuerySchema = z.strictObject({
  mood: MusicSchema.shape.mood.unwrap(),
  seed: z.coerce.number().pipe(MusicSchema.shape.seed.unwrap()),
  volumeDb: z.coerce.number().pipe(MusicSchema.shape.volumeDb.unwrap()),
});

/** A logo file the style gate sends: the image itself, since the page cannot name a file on the server. */
const LogoUploadSchema = z.strictObject({ dataUrl: z.string() });

/**
 * `PUT /api/projects/:slug/style`: settings merged into config.json as a JSON
 * Merge Patch (objects merge, null removes, the rest replaces), and logo files
 * to copy into assets/, as MCP's `set_style` takes them.
 */
export const StyleEditSchema = z.strictObject({
  config: z.record(z.string(), z.unknown()).optional(),
  logo: z
    .strictObject({
      light: LogoUploadSchema.optional(),
      dark: LogoUploadSchema.optional(),
      corner: z.enum(LOGO_CORNERS).optional(),
      show: z.enum(LOGO_SHOWS).optional(),
    })
    .optional(),
});
export type StyleEdit = z.output<typeof StyleEditSchema>;

/** The largest style edit: two logos at their largest, as base64, and room for the settings. */
export const MAX_STYLE_BYTES = Math.ceil((2 * LOGO_MAX_BYTES * 4) / 3) + BYTES_PER_MB / 4;

/** A saved style: the whole config as it now is, and what the save had to repair. */
export const StyleSavedSchema = z.object({
  config: ConfigSchema,
  warnings: z.array(z.string()),
});

/** `PUT /api/projects/:slug/colours`: the graph with its new colours. */
export const ColoursSavedSchema = z.object({ graph: GraphSchema });

/** `GET /api/projects/:slug/logo`: the saved logo as the preview draws it, or null without one. */
export const SavedLogoSchema = z.object({ logo: LogoImagesSchema.nullable() });

/** `POST /api/projects`: only the name; everything else starts at its default. */
export const NewProjectSchema = z.strictObject({ name: ProjectSchema.shape.name });

export const CreatedProjectSchema = z.object({ slug: SlugSchema, project: ProjectSchema });

/** What the list shows of a project. Not strict, so it takes a whole project and keeps only these. */
export const ProjectSummarySchema = z.object({
  ...ProjectSchema.pick({ name: true, gate: true, origin: true, updatedAt: true }).shape,
  slug: SlugSchema,
});

/** `GET /api/projects`: the projects, newest first, and the folders whose project.json can't be read. */
export const ProjectListSchema = z.object({
  projects: z.array(ProjectSummarySchema),
  broken: z.array(z.object({ slug: SlugSchema, errors: z.array(ValidationErrorSchema) })),
});

/**
 * `GET /api/projects/:slug`: the project's files, each already checked by the
 * server (the storyboard and layout against the graph too). A file is null
 * when it is missing or broken; `problems` names what is wrong with the
 * broken ones, so one bad file does not hide the rest of the project.
 */
export const OpenedProjectSchema = z.object({
  slug: SlugSchema,
  project: ProjectSchema,
  graph: GraphSchema.nullable(),
  storyboard: StoryboardSchema.nullable(),
  brief: BriefSchema.nullable(),
  layout: LayoutSchema.nullable(),
  config: ConfigSchema.nullable(),
  problems: z.array(ValidationErrorSchema),
});

/**
 * The preview gate's sound: the voice being spoken (how many lines so far),
 * the soundtrack being mixed, ready (its key names the file, and the
 * narration is measured), silent (neither voice nor music), or failed.
 */
/** How long a preview soundtrack's key is: hex digits of a hash of what the sound follows. */
export const PREVIEW_KEY_LENGTH = 32;
export const PreviewKeySchema = z.string().regex(new RegExp(`^[0-9a-f]{${PREVIEW_KEY_LENGTH}}$`));

export const PreviewSoundSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }),
  z.object({ state: z.literal("speaking"), spoken: z.int().min(0), total: z.int().min(0) }),
  z.object({ state: z.literal("mixing") }),
  z.object({
    state: z.literal("ready"),
    key: PreviewKeySchema,
    narration: NarrationSchema,
  }),
  z.object({ state: z.literal("silent") }),
  z.object({
    state: z.literal("failed"),
    /** What failed: the voice, or the mix (ffmpeg missing, or the mix itself). */
    step: z.enum(["voice", "mix"]),
    message: z.string(),
  }),
]);
export type PreviewSound = z.output<typeof PreviewSoundSchema>;
/** Each state the preview's sound can be in. */
const PREVIEW_SOUND_STATES = PreviewSoundSchema.options.map((option) => option.shape.state.value);

/**
 * A run of the checks from the Preview gate: waiting for the preview's
 * sound (the checks are timed by its voice and measure its soundtrack),
 * checking the beats on the page, done, or failed with why.
 */
export const ChecksRunSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }),
  z.object({ state: z.literal("waiting") }),
  z.object({ state: z.literal("checking"), checked: z.int().min(0), total: z.int().min(0) }),
  z.object({ state: z.literal("done") }),
  z.object({ state: z.literal("failed"), message: z.string() }),
]);
export type ChecksRun = z.output<typeof ChecksRunSchema>;
const CHECKS_RUN_STATES = ChecksRunSchema.options.map((option) => option.shape.state.value);

/**
 * `GET /api/projects/:slug/checks`: the run under way, if any, and the last
 * report (`checks.json`), with whether it is about the files as they are now.
 */
export const PreviewChecksSchema = z.object({
  run: ChecksRunSchema,
  report: CheckReportSchema.nullable(),
  upToDate: z.boolean(),
});
export type PreviewChecks = z.output<typeof PreviewChecksSchema>;

/** `POST /api/projects/:slug/renders`: what to render; the project's style for what is left out. */
export const RenderAskSchema = RenderRequestSchema.omit({ slug: true });
export type RenderAsk = z.output<typeof RenderAskSchema>;

/**
 * `GET /api/projects/:slug/renders`: the queue's jobs for the project, the
 * newest first, and its finished renders on disk, also the newest first.
 */
export const RendersViewSchema = z.object({
  jobs: z.array(RenderJobSchema),
  renders: z.array(RenderedFolderSchema),
});
export type RendersView = z.output<typeof RendersViewSchema>;

/** `GET /api/events`: what the server tells listeners about, including each render job's changes. */
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project-created"), slug: SlugSchema }),
  z.object({ type: z.literal("project-updated"), slug: SlugSchema }),
  /** A message was added to the project's chat. */
  z.object({ type: z.literal("chat"), slug: SlugSchema }),
  /** The preview's sound moved on: a line spoken, the mix started or done. */
  z.object({
    type: z.literal("preview-sound"),
    slug: SlugSchema,
    state: z.enum(PREVIEW_SOUND_STATES),
  }),
  /** A run of the checks moved on: a beat checked, done or failed. */
  z.object({
    type: z.literal("preview-checks"),
    slug: SlugSchema,
    state: z.enum(CHECKS_RUN_STATES),
  }),
  RenderEventSchema,
]);

export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type ProjectList = z.output<typeof ProjectListSchema>;
/** A storyboard saved at the Script gate, with the beats still stale. */
export const StoryboardSavedSchema = z.strictObject({
  storyboard: StoryboardSchema,
  staleBeats: ProjectSchema.shape.staleBeats,
});

/** Each line of the script already spoken, by its words, with its measured length in seconds. */
export const MeasuredLinesSchema = z.strictObject({
  seconds: z.record(z.string(), z.number().positive()),
});
export type MeasuredLines = z.output<typeof MeasuredLinesSchema>;

/** A brief saved at the Script gate. */
export const BriefSavedSchema = z.strictObject({ brief: BriefSchema });

/** The house rules, as the Settings page reads and writes them. */
export const HouseRulesBodySchema = z.strictObject({ text: HouseRulesSchema });
export type HouseRulesBody = z.output<typeof HouseRulesBodySchema>;

export type OpenedProject = z.output<typeof OpenedProjectSchema>;
export type ServerEvent = z.output<typeof ServerEventSchema>;
