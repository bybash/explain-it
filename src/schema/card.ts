import { z } from "zod";
import { SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";

/** The card's limits, so it reads at a glance (decision 053). */
export const CARD_LIMITS = { title: 60, bullets: 3, bullet: 80 } as const;

/**
 * A project's TL;DR card (`card.json`): a title and at most three bullets,
 * drawn beside a still of the video as one image (decision 053). Without it,
 * the card is made from the script.
 */
export const CardSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    version: z.literal(1),
    title: z
      .string()
      .trim()
      .min(1)
      .max(CARD_LIMITS.title)
      .describe("What the video is about, as a headline."),
    bullets: z
      .array(z.string().trim().min(1).max(CARD_LIMITS.bullet))
      .min(1)
      .max(CARD_LIMITS.bullets)
      .describe(
        "The points to take away, such as what changed, why, and what to look at; one line each.",
      ),
  })
  .describe("The TL;DR card: a headline and the points that sum the video up.");

export type Card = z.output<typeof CardSchema>;

export const parseCard = (data: unknown): Validated<Card> => parseWith(CardSchema, data);
