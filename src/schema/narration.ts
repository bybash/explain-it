import { z } from "zod";
import { IdSchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";

/**
 * Measured narration: seconds each spoken line lasts, by beat id. The voice
 * produces it; the render page takes it to time the beats (SPEC, Timing).
 */
export const NarrationSchema = z.record(IdSchema, z.number().positive());

export type Narration = z.output<typeof NarrationSchema>;

export const parseNarration = (data: unknown): Validated<Narration> =>
  parseWith(NarrationSchema, data);
