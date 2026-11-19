import { z } from "zod";
import { parseWith, type Validated } from "./errors.ts";

export const MAX_CATEGORY_COLOURS = 6;
export const THEME_MODES = ["light", "dark", "both"] as const;
export const CAPTION_SIZES = ["S", "M", "L"] as const;
export const MUSIC_MOODS = ["calm", "upbeat", "technical"] as const;
export const RESOLUTIONS = ["1080p", "720p"] as const;

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

const PaletteNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, { error: "must be a palette name like default or ocean" });

export const ConfigSchema = z
  .strictObject({
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
  })
  .describe("Style and output settings. Every field has a default.");

export type Config = z.output<typeof ConfigSchema>;
export type CustomPalette = z.output<typeof CustomPaletteSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/** Fills every missing field with its default. */
export const parseConfig = (data: unknown): Validated<Config> => parseWith(ConfigSchema, data);
