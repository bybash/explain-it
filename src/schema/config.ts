import { z } from "zod";
import { SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";

export const MAX_CATEGORY_COLOURS = 6;
export const THEME_MODES = ["light", "dark", "both"] as const;
export const CAPTION_SIZES = ["S", "M", "L"] as const;
export const MUSIC_MOODS = ["calm", "upbeat", "technical"] as const;
export const RESOLUTIONS = ["1080p", "720p"] as const;
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
export const CARD_LIMITS = { title: 100, description: 160 } as const;

export const TitleCardSchema = z
  .strictObject({
    title: z.string().min(1).max(CARD_LIMITS.title),
    description: z.string().min(1).max(CARD_LIMITS.description).optional(),
  })
  .describe("Opens the video: the title in the middle, the description under it.");

export const LOGO_CORNERS = ["top-right", "bottom-right"] as const;
/** Where the logo shows: the title card, the end card, both, or every frame. */
export const LOGO_SHOWS = ["start", "end", "both", "all"] as const;
/** The largest logo file, in bytes. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const LogoFileSchema = z.string().regex(/^[\w-][\w.-]*\.(png|jpe?g|svg)$/i, {
  error: "must be a file name in assets/ ending in .png, .jpg, .jpeg or .svg",
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
  .describe(`The team's logo: files in assets/, at most ${LOGO_MAX_BYTES / 1024 / 1024} MB each.`);

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
    voice: z
      .strictObject({
        enabled: z.boolean().default(true),
        id: z.string().min(1).default("af_heart").describe("A Kokoro voice id."),
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
      .strictObject({ title: TitleCardSchema.optional() })
      .optional()
      .describe("Cards that open and close the video; each can be left out."),
    logo: LogoSchema.optional(),
  })
  .describe("Style and output settings. Every field has a default.");

export type Config = z.output<typeof ConfigSchema>;
export type CustomPalette = z.output<typeof CustomPaletteSchema>;
export type TitleCard = z.output<typeof TitleCardSchema>;
export type Logo = z.output<typeof LogoSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/** Fills every missing field with its default. */
export const parseConfig = (data: unknown): Validated<Config> => parseWith(ConfigSchema, data);
