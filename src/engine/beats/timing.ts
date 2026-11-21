import type { Pace } from "../../schema/config.ts";
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
/** How fast a caption or an unspoken line can be read; also the reading-speed check's limit. */
export const CAPTION_CHARS_PER_SECOND = 15;
/** Seconds into a beat before its narration and actions start. */
export const LEAD_IN = 0.3;

/**
 * Each pace: the pause after a beat's narration and actions before the next
 * beat, and the shortest a beat can be (decision 013). Animations run at
 * their default speed at every pace; a slower pace only adds time to look.
 */
export const PACES: Readonly<
  Record<Pace, { readonly pauseAfter: number; readonly minBeat: number }>
> = {
  relaxed: { pauseAfter: 1, minBeat: 3 },
  normal: { pauseAfter: 0.6, minBeat: 2 },
  brisk: { pauseAfter: 0.3, minBeat: 1.5 },
};

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
  /** Relaxed by default. */
  readonly pace?: Pace;
  /** The measured length of the beat's spoken line, when it has been generated. */
  readonly narration?: number;
  /** Whether the narration is spoken; when not, a line is timed by reading it. On by default. */
  readonly voice?: boolean;
};

/**
 * Times one beat. Its narration and actions start after a lead-in; it lasts
 * until the longer of them ends, plus the pace's pause, and at least the
 * pace's shortest beat. Without narration it also lasts its caption's
 * reading time. Actions run in order at their default length, with any spare
 * time shared out after each. A spoken line uses its measured length, else
 * an estimate from its words; an unspoken one its reading time.
 */
export const beatTiming = (
  beat: Beat,
  { pace = "relaxed", narration, voice = true }: BeatTimingOptions = {},
): BeatTiming => {
  const { pauseAfter, minBeat } = PACES[pace];
  const durations = beat.actions.map((action) => ACTION_DURATIONS[action.type]);
  const busy = durations.reduce((sum, d) => sum + d, 0);
  const padded = (seconds: number) => LEAD_IN + seconds + pauseAfter;
  const narrationLength =
    beat.say === undefined
      ? undefined
      : voice
        ? (narration ?? estimateNarration(beat.say))
        : readingTime(beat.say);
  const duration = Math.max(
    minBeat,
    padded(busy),
    narrationLength === undefined ? readingTime(beat.caption) : padded(narrationLength),
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
