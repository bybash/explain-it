import { z } from "zod";
import { SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";
import { VOICE_IDS } from "./voices.ts";

export const MAX_CATEGORY_COLOURS = 6;
export const THEME_MODES = ["light", "dark", "both"] as const;
export const CAPTION_SIZES = ["S", "M", "L"] as const;
export const MUSIC_MOODS = ["calm", "upbeat", "technical"] as const;
export const RESOLUTIONS = ["1080p", "720p"] as const;
/** How unhurried the video is, from most to least (decision 013). */
export const PACES = ["relaxed", "normal", "brisk"] as const;
export type Pace = (typeof PACES)[number];
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

export const TitleCardSchema = z
  .strictObject({
    title: z.string().min(1).max(CARD_LIMITS.title),
    description: z.string().min(1).max(CARD_LIMITS.description).optional(),
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
        "How unhurried the video is: the pause after each narration line and the shortest a beat can be. Animations keep their speed at every pace.",
      ),
    voice: z
      .strictObject({
        enabled: z.boolean().default(true),
        id: z
          .enum(VOICE_IDS)
          .default("af_heart")
          .describe("A Kokoro voice: a = American, b = British English; f = female, m = male."),
        speed: z.number().min(0.5).max(2).default(1),
      })
      .prefault({}),
    captions: z
      .strictObject({
        narration: z.boolean().default(true),
        step: z.boolean().default(true),
        size: z.enum(CAPTION_SIZES).default("M"),
      })
      .prefault({}),
    music: z
      .strictObject({
        enabled: z.boolean().default(true),
        mood: z.enum(MUSIC_MOODS).default("calm"),
        seed: z.int().min(0).default(1),
        volumeDb: z.number().min(-60).max(0).default(-24),
      })
      .prefault({}),
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
  })
  .describe("Style and output settings. Every field has a default.");

export type Config = z.output<typeof ConfigSchema>;
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
