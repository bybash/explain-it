import type { BeatPlan } from "../engine/beats/build.ts";
import { type CheckWarning, NARRATION_FIT, READING_SPEED } from "../schema/checks.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { fitProblems, readingProblems } from "./timing.ts";

/** A margin under the most characters, so the words the LLM writes fit with room to spare. */
const ROOM = 0.9;

/** Words that only fewer words fix: a caption or line read too fast, or a line too long for its beat. */
export type WordProblem = {
  readonly kind: "words";
  readonly beat: string;
  readonly field: "caption" | "say";
  readonly why: "read" | "fit";
  /** The words as they are now. */
  readonly text: string;
  /** The most characters that would fit. */
  readonly most: number;
};

/** What the chat reports: words to shorten, or another problem the checks found. */
export type ChatProblem =
  | WordProblem
  | { readonly kind: "warning"; readonly warning: CheckWarning };

/**
 * The quick checks' problems as words to shorten (decision 038): each
 * beat's caption or line once, with the most characters it can have, from
 * how much too fast it goes now.
 */
export const wordProblems = (
  plan: BeatPlan,
  storyboard: Storyboard,
  narration: Narration,
): WordProblem[] => {
  const beats = new Map(storyboard.scenes.flatMap((s) => s.beats.map((b) => [b.id, b])));
  const found = new Map<string, WordProblem>();
  const add = (
    beat: string,
    field: WordProblem["field"],
    why: WordProblem["why"],
    over: number,
  ) => {
    const text = beats.get(beat)?.[field];
    if (text === undefined) return;
    const most = Math.max(1, Math.floor((text.length / over) * ROOM));
    const key = `${beat}:${field}`;
    const known = found.get(key);
    if (!known || most < known.most)
      found.set(key, { kind: "words", beat, field, why, text, most });
  };
  for (const p of readingProblems(plan))
    add(p.beat.id, p.kind === "step" ? "caption" : "say", "read", p.speed / READING_SPEED[p.kind]);
  for (const p of fitProblems(plan, narration))
    add(p.beat.id, "say", "fit", p.ratio / NARRATION_FIT);
  return [...found.values()];
};

const FIELD_NAMES = { caption: "caption", say: "line" } as const;

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** A problem in plain words, as the chat says it. */
export const sayProblem = (problem: ChatProblem): string => {
  if (problem.kind === "words")
    return `The ${FIELD_NAMES[problem.field]} of beat "${problem.beat}" ${
      problem.why === "read" ? "goes by too fast to read" : "is too long to say in its beat"
    }.`;
  const { warning } = problem;
  return "beat" in warning
    ? `In beat "${warning.beat}", ${warning.message}.`
    : sentence(warning.message);
};

/**
 * What makes a problem the same one from one run to the next, so the chat
 * reports it once: not its words or how far it is out, which an edit
 * changes without fixing it.
 */
export const problemKey = (problem: ChatProblem): string => {
  if (problem.kind === "words") return `words:${problem.beat}:${problem.field}`;
  const { warning } = problem;
  if (!("beat" in warning))
    return `${warning.check}:${warning.message.split(" ").slice(0, 3).join(" ")}`;
  return `${warning.check}:${warning.beat}:${[...(warning.nodes ?? [])].sort().join(",")}`;
};
