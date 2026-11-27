import type { BeatPlan } from "../engine/beats/build.ts";
import { LEAD_IN } from "../engine/beats/timing.ts";
import {
  type BeatWarning,
  type CheckWarning,
  LOUDNESS,
  NARRATION_FIT,
  READING_SPEED,
} from "../schema/checks.ts";
import type { Narration } from "../schema/narration.ts";

/** A number as a message says it: at most `decimals` decimals, none when whole. */
const said = (n: number, decimals = 1): string => String(Number(n.toFixed(decimals)));

/** Allowance for floating point: a caption timed to exactly its limit passes. */
const EPSILON = 1e-9;

/**
 * Captions on screen too briefly to read (SPEC, Checks): a step caption at
 * `READING_SPEED.step` characters a second over its beat, a narration
 * caption at `READING_SPEED.narration` over its cue.
 */
/** A caption on screen too briefly to read: which kind, of which beat, and how fast it goes. */
export type ReadingProblem = {
  readonly kind: keyof typeof READING_SPEED;
  readonly beat: BeatPlan["beats"][number];
  readonly at: number;
  readonly speed: number;
};

/** The captions read too fast, as data: the reading-speed check's warnings, and the editor's hints, say them. */
export const readingProblems = (plan: BeatPlan): ReadingProblem[] => {
  const beats = new Map(plan.beats.map((b) => [b.id, b]));
  const captions = [
    ...plan.overlays.flatMap((o) =>
      o.kind === "step" || o.kind === "list"
        ? [
            {
              beat: beats.get(o.id.replace(/^(step|list):/, "")),
              text: o.text,
              // A line of the beat list stays on screen, but is read while its beat is on.
              at: o.at,
              until: o.kind === "list" ? o.fadesAt : o.until,
              kind: "step" as const,
            },
          ]
        : [],
    ),
    ...plan.cues.map((c) => ({
      beat: beats.get(c.beat),
      text: c.text,
      at: c.start,
      until: c.end,
      kind: "narration" as const,
    })),
  ];
  return captions.flatMap(({ beat, text, at, until, kind }): ReadingProblem[] => {
    // Every caption belongs to a beat of this plan; one that does not is a bug, not a warning.
    if (!beat) throw new Error(`a ${kind} caption with no beat: "${text}"`);
    const speed = text.length / (until - at);
    return speed <= READING_SPEED[kind] + EPSILON ? [] : [{ kind, beat, at, speed }];
  });
};

export const readingWarnings = (plan: BeatPlan): BeatWarning[] =>
  readingProblems(plan).map(({ kind, beat, at, speed }) => ({
    check: "reading-speed",
    scene: beat.scene,
    beat: beat.id,
    at,
    message: `${kind === "step" ? "the step caption" : "a narration caption"} of beat "${beat.id}" needs ${said(speed)} characters a second to read; ${READING_SPEED[kind]} is the most`,
  }));

/** A line longer than the room its beat leaves it: by how much faster it would have to be said. */
export type FitProblem = { readonly beat: BeatPlan["beats"][number]; readonly ratio: number };

/**
 * Lines longer than the room their beat leaves them, from the lead-in to the
 * beat's end (SPEC, Checks), as data. Narration-first timing makes every
 * line fit the plan built from it, so in a check this guards that rule; a
 * plan timed by estimates may not fit.
 */
export const fitProblems = (plan: BeatPlan, narration: Narration): FitProblem[] =>
  plan.beats.flatMap((beat): FitProblem[] => {
    const measured = narration[beat.id];
    if (measured === undefined) return [];
    const ratio = measured / (beat.end - beat.start - LEAD_IN);
    return ratio > NARRATION_FIT + EPSILON ? [{ beat, ratio }] : [];
  });

export const narrationFitWarnings = (plan: BeatPlan, narration: Narration): BeatWarning[] =>
  fitProblems(plan, narration).map(({ beat, ratio }) => ({
    check: "narration-fit",
    scene: beat.scene,
    beat: beat.id,
    at: beat.start,
    message: `the narration of beat "${beat.id}" would have to be said ${said(ratio, 2)} times faster to fit; ${NARRATION_FIT} is the most`,
  }));

/** The final mix against SPEC's loudness (`LOUDNESS`): its integrated level and its true peak. */
export const loudnessWarnings = ({
  integrated,
  truePeak,
}: {
  readonly integrated: number;
  readonly truePeak: number;
}): CheckWarning[] => [
  ...(Math.abs(integrated - LOUDNESS.target) > LOUDNESS.tolerance
    ? [
        {
          check: "loudness" as const,
          message: `the mix is at ${said(integrated)} LUFS; it should be ${LOUDNESS.target} ± ${LOUDNESS.tolerance}`,
        },
      ]
    : []),
  ...(truePeak > LOUDNESS.maxTruePeak
    ? [
        {
          check: "loudness" as const,
          message: `the mix peaks at ${said(truePeak)} dBTP; it should stay at or below ${LOUDNESS.maxTruePeak}`,
        },
      ]
    : []),
];
