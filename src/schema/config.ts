import { z } from "zod";
import { SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";
import { VOICE_IDS } from "./voices.ts";

export const MAX_CATEGORY_COLOURS = 6;
export const THEME_MODES = ["light", "dark", "both"] as const;
export const CAPTION_SIZES = ["S", "M", "L"] as const;
export const MUSIC_MOODS = ["calm", "upbeat", "technical"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
/** How far further the music dips while the voice speaks, in dB (decision 015). */
export const MUSIC_DUCK_DB = -6;
/** The music's seed: the same seed always gives the same music (decision 014). */
export const MusicSeedSchema = z.int().min(0);
export const RESOLUTIONS = ["1080p", "720p"] as const;
/** How unhurried the video is, from most to least (decision 013). */
export const PACES = ["relaxed", "normal", "brisk"] as const;
export type Pace = (typeof PACES)[number];
/**
 * Each pace: the pause after a beat's narration and actions before the next
 * beat, and the shortest a beat can be, in seconds. Animations run at their
 * default speed at every pace; a slower pace only adds time to look.
 */
export const PACE_TIMINGS: Readonly<
  Record<Pace, { readonly pauseAfter: number; readonly minBeat: number }>
> = {
  relaxed: { pauseAfter: 1, minBeat: 3 },
  normal: { pauseAfter: 0.6, minBeat: 2 },
  brisk: { pauseAfter: 0.3, minBeat: 1.5 },
};
export type Resolution = (typeof RESOLUTIONS)[number];

const HexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "must be a hex colour like #1a2b3c" });

const paletteColours = {
  background: HexColour,
  surface: HexColour,
  text: HexColour,
  muted: HexColour,
  accent: HexColour,
  categories: z
    .array(HexColour)
    .max(MAX_CATEGORY_COLOURS)
    .describe("Colours for node, edge and zone categories, in order."),
};

export const CustomPaletteSchema = z.strictObject({
  ...paletteColours,
  dark: z
    .strictObject(paletteColours)
    .optional()
    .describe("The dark variant; generated from the light palette when missing."),
});

/** Card text limits (SPEC, Config); text wraps to at most three lines within them. */
export const CARD_LIMITS = {
  title: 100,
  description: 160,
  headline: 100,
  link: 200,
  where: 80,
  credit: 80,
} as const;

/** Where the scene title and the step captions go (decision 049). */
export const CAPTION_PLACES = ["top", "bottom"] as const;
export type CaptionPlace = (typeof CAPTION_PLACES)[number];

/** The angles a video's scenes are drawn at (decision 047). */
export const ANGLES = ["isometric", "wide", "high"] as const;
export type Angle = (typeof ANGLES)[number];
/** The elevation, in degrees, whose floor depth each angle draws; isometric is the engine's own (about 35.3). */
export const ANGLE_ELEVATIONS: Readonly<Record<Angle, number | undefined>> = {
  isometric: undefined,
  wide: 25,
  high: 50,
};

/** How far the camera zooms in, and moves, as a share of the area the scene is framed in (clear of the titles and captions that take room from it). */
export const CAMERA_LIMITS = { zoom: { min: 1, max: 3 }, move: 0.5 } as const;

export const CameraSchema = z
  .strictObject({
    zoom: z
      .number()
      .min(CAMERA_LIMITS.zoom.min)
      .max(CAMERA_LIMITS.zoom.max)
      .describe("1 frames the scene as it fits; 3 is three times as close."),
    x: z
      .number()
      .min(-CAMERA_LIMITS.move)
      .max(CAMERA_LIMITS.move)
      .describe("Moves the scene right (positive) or left, as a share of its area's width."),
    y: z
      .number()
      .min(-CAMERA_LIMITS.move)
      .max(CAMERA_LIMITS.move)
      .describe("Moves the scene down (positive) or up, as a share of its area's height."),
  })
  .describe("How a scene is framed: zoomed in and moved from where it fits.");
export type Camera = z.output<typeof CameraSchema>;

/** The camera that changes nothing: the scene framed as it fits. A scene's camera is left out instead. */
export const FITTED_CAMERA: Camera = { zoom: 1, x: 0, y: 0 };

/** How long a title card may be set to hold, in whole seconds. */
export const TITLE_CARD_SECONDS = { min: 2, max: 10 } as const;

/**
 * How long a title card holds when its \`seconds\` are not set: read with
 * nothing else on screen, so faster than a caption, between these bounds.
 */
export const TITLE_CARD_AUTO = { charsPerSecond: 20, min: 3, max: 5 } as const;

/** "3 to 5 s": the title card's automatic hold, as people read it. */
export const TITLE_CARD_AUTO_TEXT = `${TITLE_CARD_AUTO.min} to ${TITLE_CARD_AUTO.max} s`;

export const TitleCardSchema = z
  .strictObject({
    title: z.string().min(1).max(CARD_LIMITS.title),
    description: z.string().min(1).max(CARD_LIMITS.description).optional(),
    seconds: z
      .int()
      .min(TITLE_CARD_SECONDS.min)
      .max(TITLE_CARD_SECONDS.max)
      .optional()
      .describe(
        `How long it holds, in seconds; by its text when missing (${TITLE_CARD_AUTO_TEXT}).`,
      ),
  })
  .describe("Opens the video: the title in the middle, the description under it.");

export const LOGO_CORNERS = ["top-right", "bottom-right"] as const;
/** Where the logo shows: the title card, the end card, both, or every frame. */
export const LOGO_SHOWS = ["start", "end", "both", "all"] as const;
export const BYTES_PER_MB = 1024 * 1024;
/** The largest logo file. */
export const LOGO_MAX_MB = 2;
export const LOGO_MAX_BYTES = LOGO_MAX_MB * BYTES_PER_MB;

/** The logo's image types by file extension: the one list the config, the loader and the page share. */
export const LOGO_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
} as const;
export type LogoType = (typeof LOGO_TYPES)[keyof typeof LOGO_TYPES];

const extensions = Object.keys(LOGO_TYPES);

/** The video's two modes, each of which may have its own logo file. */
export const LOGO_MODES = ["light", "dark"] as const;
export type LogoMode = (typeof LOGO_MODES)[number];

/** The extension a logo of each type is saved with: the first LOGO_TYPES gives for it. */
const EXTENSION_OF = Object.fromEntries(
  Object.entries(LOGO_TYPES)
    .reverse()
    .map(([extension, type]) => [type, extension]),
) as Readonly<Record<LogoType, string>>;

/** The name a logo file is saved under in assets/: `logo-<mode>` and its type's extension. */
export const logoFileName = (mode: LogoMode, type: LogoType): string =>
  `logo-${mode}${EXTENSION_OF[type]}`;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const LogoFileSchema = z
  .string()
  .regex(new RegExp(`^[\\w-][\\w.-]*(${extensions.map(escaped).join("|")})$`), {
    error: `must be a file name in assets/ ending in ${extensions.slice(0, -1).join(", ")} or ${extensions.at(-1)}`,
  });

export const LogoSchema = z
  .strictObject({
    light: LogoFileSchema.optional(),
    dark: LogoFileSchema.optional().describe("If only one file is given, it serves both modes."),
    corner: z.enum(LOGO_CORNERS).default("top-right"),
    show: z.enum(LOGO_SHOWS).default("both"),
  })
  .refine((logo) => logo.light !== undefined || logo.dark !== undefined, {
    error: "needs a light or a dark file",
  })
  // The refinement is lost in JSON Schema; this says the same there.
  .meta({
    description: `The team's logo: files in assets/, at most ${LOGO_MAX_MB} MB each.`,
    anyOf: [{ required: ["light"] }, { required: ["dark"] }],
  });

const mediaTypes = [...new Set(Object.values(LOGO_TYPES))];

export const LogoDataUrlSchema = z
  .string()
  .regex(new RegExp(`^data:(${mediaTypes.map(escaped).join("|")});base64,[A-Za-z0-9+/]+=*$`), {
    error: `must be a base64 data URL of ${mediaTypes.slice(0, -1).join(", ")} or ${mediaTypes.at(-1)}`,
  });

/** The logo's images as the renderer hands them to the page: one data URL per mode. */
export const LogoImagesSchema = z.strictObject({
  light: LogoDataUrlSchema,
  dark: LogoDataUrlSchema,
});

export const EndCardSchema = z
  .strictObject({
    headline: z.string().min(1).max(CARD_LIMITS.headline),
    link: z
      .string()
      .max(CARD_LIMITS.link)
      .regex(/^https?:\/\/[^\s\p{Cc}/?#]+[^\s\p{Cc}]*$/u, { error: "must be an http or https URL" })
      .optional()
      .describe(
        "An http or https URL; also drawn as a QR code, since nobody can click a link in a video.",
      ),
    where: z
      .string()
      .min(1)
      .max(CARD_LIMITS.where)
      .optional()
      .describe("Where to find the feature."),
    credit: z.string().min(1).max(CARD_LIMITS.credit).optional().describe("Who made the video."),
  })
  .describe(
    "Closes the video: the headline, the link with its QR code, where to find it, the credit.",
  );

/** How fast the voice may speak, as a multiple of its own pace. */
export const VOICE_SPEEDS = { min: 0.5, max: 2 } as const;
/** How loud the music may be under the voice, in dB. */
export const MUSIC_VOLUMES_DB = { min: -60, max: 0 } as const;

/** How the narration is spoken: whether, with which voice, how fast. */
export const VoiceSchema = z.strictObject({
  enabled: z.boolean().default(true),
  id: z
    .enum(VOICE_IDS)
    .default("af_heart")
    .describe("A Kokoro voice: a = American, b = British English; f = female, m = male."),
  speed: z.number().min(VOICE_SPEEDS.min).max(VOICE_SPEEDS.max).default(1),
});

/** The music under the voice: whether, its mood, which take of it, how loud. */
export const MusicSchema = z.strictObject({
  enabled: z.boolean().default(true),
  mood: z.enum(MUSIC_MOODS).default("calm"),
  seed: MusicSeedSchema.default(1),
  volumeDb: z
    .number()
    .min(MUSIC_VOLUMES_DB.min)
    .max(MUSIC_VOLUMES_DB.max)
    .default(-12)
    .describe(
      `The music's level against the voice while nobody speaks, in dB; it dips ${-MUSIC_DUCK_DB} dB more while the voice speaks. Without a voice the music is the whole mix, brought to the target loudness, so this has no effect.`,
    ),
});

const PaletteNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, { error: "must be a palette name like default or ocean" });

export const ConfigSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    theme: z
      .strictObject({
        palette: z.union([PaletteNameSchema, CustomPaletteSchema]).default("default"),
        mode: z.enum(THEME_MODES).default("light"),
      })
      .prefault({}),
    font: z.string().min(1).default("inter").describe("A bundled font id or an uploaded font."),
    pacing: z
      .enum(PACES)
      .default("relaxed")
      .describe(
        `How unhurried the video is: the pause after each beat and the shortest a beat can be (${PACES.map((pace) => `${pace}: ${PACE_TIMINGS[pace].pauseAfter} s, ${PACE_TIMINGS[pace].minBeat} s`).join("; ")}). Animations keep their speed at every pace.`,
      ),
    voice: VoiceSchema.prefault({}),
    captions: z
      .strictObject({
        narration: z.boolean().default(true),
        step: z.boolean().default(true),
        list: z
          .boolean()
          .default(false)
          .describe(
            "Lists the scene's step captions down the left side, the current one solid and the ones before it faded, in place of the step caption at the top (decision 048).",
          ),
        size: z.enum(CAPTION_SIZES).default("M"),
        place: z
          .enum(CAPTION_PLACES)
          .default("top")
          .describe(
            "Where the scene title and the step captions go: at the top, or in the bottom-left corner, above the narration, so the scene is framed in the whole height and the step captions can take two lines (decision 049).",
          ),
      })
      .prefault({}),
    music: MusicSchema.prefault({}),
    output: z
      .strictObject({
        resolution: z.enum(RESOLUTIONS).default("1080p"),
      })
      .prefault({}),
    cards: z
      .strictObject({ title: TitleCardSchema.optional(), end: EndCardSchema.optional() })
      .optional()
      .describe("Cards that open and close the video; each can be left out."),
    logo: LogoSchema.optional(),
    angle: z
      .enum(ANGLES)
      .default("isometric")
      .describe(
        "How the scenes are drawn: isometric; wide (flatter, so a layout fills a 16:9 frame); or high (deeper, for a tall layout).",
      ),
    camera: z
      .record(z.string(), CameraSchema)
      .optional()
      .describe("Each scene's camera, by scene id; a scene not named is framed as it fits."),
  })
  .describe("Style and output settings. Every field has a default.");

export type Config = z.output<typeof ConfigSchema>;

/** Whether the step captions are drawn as the beat list: only when they are drawn at all (decision 048). */
export const listsSteps = (captions: Config["captions"]): boolean => captions.step && captions.list;
/** How the narration is spoken: whether, with which voice, how fast. */
export type VoiceConfig = Config["voice"];
export type CustomPalette = z.output<typeof CustomPaletteSchema>;
export type TitleCard = z.output<typeof TitleCardSchema>;
export type EndCard = z.output<typeof EndCardSchema>;
export type Logo = z.output<typeof LogoSchema>;
export type LogoImages = z.output<typeof LogoImagesSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

export const parseLogoImages = (data: unknown): Validated<LogoImages> =>
  parseWith(LogoImagesSchema, data);

/** Fills every missing field with its default. */
export const parseConfig = (data: unknown): Validated<Config> => parseWith(ConfigSchema, data);
