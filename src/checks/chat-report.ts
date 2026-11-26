import type { BeatPlan } from "../engine/beats/build.ts";
import { type CheckWarning, NARRATION_FIT, READING_SPEED } from "../schema/checks.ts";
import { WORD_FIELD_NAMES, type WordField } from "../schema/fixes.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { fitProblems, readingProblems } from "./timing.ts";

/** A margin under the most characters, so the words the LLM writes fit with room to spare. */
const ROOM = 0.9;

/** Words that only fewer words fix: a caption or line read too fast, or a line too long for its beat. */
export type WordProblem = {
  readonly kind: "words";
  readonly beat: string;
  readonly field: WordField;
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

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** The beat a problem is at; none for one about the whole video. */
export const beatOf = (problem: ChatProblem): string | undefined =>
  problem.kind === "words"
    ? problem.beat
    : "beat" in problem.warning
      ? problem.warning.beat
      : undefined;

/** A problem in plain words, as the chat says it. */
export const sayProblem = (problem: ChatProblem): string => {
  if (problem.kind === "words")
    return `The ${WORD_FIELD_NAMES[problem.field]} of beat "${problem.beat}" ${
      problem.why === "read" ? "goes by too fast to read" : "is too long to say in its beat"
    }.`;
  const beat = beatOf(problem);
  return beat
    ? `In beat "${beat}", ${problem.warning.message}.`
    : sentence(problem.warning.message);
};

/**
 * What makes a problem the same one from one run to the next, so the chat
 * reports it once: not its words or how far it is out, which an edit
 * changes without fixing it.
 */
export const problemKey = (problem: ChatProblem): string => {
  if (problem.kind === "words") return `words:${problem.beat}:${problem.field}`;
  const { warning } = problem;
  // The mix's level and peak are one problem: the mix.
  if (!("beat" in warning)) return warning.check;
  return `${warning.check}:${warning.beat}:${[...(warning.nodes ?? [])].sort().join(",")}`;
};
