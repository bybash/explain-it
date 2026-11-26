import { z } from "zod";
import { SchemaKeySchema } from "./common.ts";

/**
 * The shapes a story can take (SPEC, MCP: Guidance): the guide offers
 * them to an agent, and a project's brief names the one it follows.
 */
export const STORY_SHAPES = [
  {
    id: "problem",
    label: "Problem, how it works, outcome",
    beats:
      "the first beat names the problem the flow solves, the middle beats walk through the flow, and the last shows what the user has at the end",
    suits: "most flows",
  },
  {
    id: "before-after",
    label: "Before and after",
    beats:
      "the first beats show how it worked before and what was wrong with it, then what changed, and the last shows what is better now",
    suits: "a change, a pull request or a migration",
  },
  {
    id: "failure",
    label: "The happy path, then what goes wrong",
    beats:
      "the first beats show the flow working, then where it can fail and how it recovers, and the last shows that the user is safe either way",
    suits: "retries, errors and edge cases",
  },
  {
    id: "zoom",
    label: "The whole system, then one part",
    beats:
      "the first scene shows the whole system at a glance, then a second scene looks closely at the one part the video is about",
    suits: "a part that only makes sense in its place",
  },
] as const;

export type StoryShape = (typeof STORY_SHAPES)[number]["id"];
export const STORY_SHAPE_IDS = STORY_SHAPES.map((s) => s.id) as [StoryShape, ...StoryShape[]];

/** How long the hook may take: the first beat makes the viewer want the rest within this. */
export const HOOK_SECONDS = 5;
/** How long a video is best kept, in seconds: long enough to explain, short enough to be watched. */
export const TARGET_SECONDS = { min: 45, max: 90 } as const;

export const MAX_AUDIENCE = 80;
export const MAX_TAKEAWAY = 140;
export const MAX_HOOK = 140;
export const MAX_NOTES = 2000;
export const MAX_HOUSE_RULES = 4000;

/** A line of the brief: words, not blank. */
const line = (max: number, what: string) =>
  z.string().trim().min(1).max(max).optional().describe(what);

/**
 * A project's story brief (`brief.json`), agreed before the beats are
 * written: every field is optional, so a brief can hold only notes.
 */
export const BriefSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    version: z.literal(1),
    audience: line(MAX_AUDIENCE, 'Who the video is for, such as "new backend developers".'),
    takeaway: line(MAX_TAKEAWAY, "The one thing the viewer should remember, in a sentence."),
    shape: z.enum(STORY_SHAPE_IDS).optional().describe("The shape the story takes."),
    hook: line(MAX_HOOK, "What the first beat says to make the viewer want the rest."),
    notes: line(
      MAX_NOTES,
      "This project's own notes and rules for the story: what to stress, what to leave out.",
    ),
  })
  .describe("The story a project's script tells: who it is for, what to remember, its shape.");

export type Brief = z.output<typeof BriefSchema>;

/**
 * The house rules (`house-rules.md` in the projects folder): free text that
 * every project's story follows, such as "no jargon".
 */
export const HouseRulesSchema = z.string().max(MAX_HOUSE_RULES);
