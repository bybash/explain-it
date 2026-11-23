import { READING_SPEED } from "../../schema/checks.ts";
import { type Config, DEFAULT_CONFIG, PACE_TIMINGS, type Pace } from "../../schema/config.ts";
import type { ACTION_TYPES, Beat } from "../../schema/storyboard.ts";
import { EDGE_TIMING } from "../edges/flow.ts";
import { NODE_TIMING } from "../iso/tweens.ts";

/** How long each action takes at default speed, in seconds (SPEC, Timing). */
export const ACTION_DURATIONS: Readonly<Record<(typeof ACTION_TYPES)[number], number>> = {
  appear: NODE_TIMING.appear,
  // A flow draws its edge in, then sends the dot along it.
  flow: EDGE_TIMING.draw + EDGE_TIMING.send,
  highlight: NODE_TIMING.highlight,
  callout: 0.8,
  dim: NODE_TIMING.dim,
  badge: 0.4,
};

/** Narration estimated before the voice exists (SPEC, Timing). */
export const WORDS_PER_SECOND = 2.5;
/** How fast a caption or an unspoken line can be read: the reading-speed check's limit for captions read alone. */
export const CAPTION_CHARS_PER_SECOND = READING_SPEED.step;
/** Seconds into a beat before its narration and actions start. */
export const LEAD_IN = 0.3;

/**
 * How a beat's narration line is timed: spoken (measured, or estimated
 * until the voice exists), read on screen when the voice is off, or unseen
 * when neither the voice nor the narration captions carry it.
 */
export type NarrationMode = "spoken" | "read" | "unseen";

export const narrationMode = (config: Pick<Config, "voice" | "captions">): NarrationMode =>
  config.voice.enabled ? "spoken" : config.captions.narration ? "read" : "unseen";

/** Seconds a narration line takes to say, estimated from its words. */
export const estimateNarration = (say: string): number =>
  say.split(/\s+/).filter((word) => word !== "").length / WORDS_PER_SECOND;

/** Seconds it takes to read a line on screen. */
export const readingTime = (text: string): number => text.length / CAPTION_CHARS_PER_SECOND;

/** When things happen within one beat, in seconds from its start. */
export type BeatTiming = {
  readonly duration: number;
  /** Missing for a beat without narration. */
  readonly narration?: { readonly at: number; readonly length: number };
  /** One per action, in the beat's order. */
  readonly actions: readonly { readonly at: number; readonly duration: number }[];
};

export type BeatTimingOptions = {
  /** The config's default when not given. */
  readonly pace?: Pace;
  /** How the narration is timed; the config's default when not given. */
  readonly mode?: NarrationMode;
  /** The measured length of the beat's spoken line, when it has been generated. */
  readonly narration?: number;
};

/**
 * Times one beat. Its narration and actions start after a lead-in; it lasts
 * until the longer of them ends, plus the pace's pause, and at least the
 * pace's shortest beat, and its step caption's reading time. Actions run in order at their default length, with any spare
 * time shared out after each. A spoken line uses its measured length, else
 * an estimate from its words; an unspoken one its reading time.
 */
export const beatTiming = (
  beat: Beat,
  {
    pace = DEFAULT_CONFIG.pacing,
    mode = narrationMode(DEFAULT_CONFIG),
    narration,
  }: BeatTimingOptions = {},
): BeatTiming => {
  const { pauseAfter, minBeat } = PACE_TIMINGS[pace];
  const durations = beat.actions.map((action) => ACTION_DURATIONS[action.type]);
  const busy = durations.reduce((sum, d) => sum + d, 0);
  const padded = (seconds: number) => LEAD_IN + seconds + pauseAfter;
  const narrationLength =
    beat.say === undefined || mode === "unseen"
      ? undefined
      : mode === "spoken"
        ? (narration ?? estimateNarration(beat.say))
        : readingTime(beat.say);
  // Every beat leaves time to read its step caption, spoken or not (decision 017).
  const duration = Math.max(
    minBeat,
    padded(busy),
    readingTime(beat.caption),
    narrationLength === undefined ? 0 : padded(narrationLength),
  );

  const spare = durations.length === 0 ? 0 : (duration - padded(busy)) / durations.length;
  let at = LEAD_IN;
  const actions = durations.map((d) => {
    const slot = { at, duration: d };
    at += d + spare;
    return slot;
  });
  return {
    duration,
    ...(narrationLength === undefined
      ? {}
      : { narration: { at: LEAD_IN, length: narrationLength } }),
    actions,
  };
};
