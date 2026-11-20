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
/** A beat without narration shows its caption at least this long per character. */
export const CAPTION_CHARS_PER_SECOND = 15;
/** Seconds before narration and actions start in a beat, and after they end. */
export const BEAT_PADDING = 0.3;

/** Seconds a narration line takes to say, estimated from its words. */
export const estimateNarration = (say: string): number =>
  say.split(/\s+/).filter((word) => word !== "").length / WORDS_PER_SECOND;

/** When things happen within one beat, in seconds from its start. */
export type BeatTiming = {
  readonly duration: number;
  /** Missing for a beat without narration. */
  readonly narration?: { readonly at: number; readonly length: number };
  /** One per action, in the beat's order. */
  readonly actions: readonly { readonly at: number; readonly duration: number }[];
};

/**
 * Times one beat: it lasts max(narration + 0.6 s, its actions at default
 * speed), and without narration at least its caption ÷ 15 characters per
 * second. Actions run in order at their default length, with the spare time
 * shared out after each one. `narrationSeconds` is the measured voice length;
 * without it the narration is estimated from its words.
 */
export const beatTiming = (beat: Beat, narrationSeconds?: number): BeatTiming => {
  const durations = beat.actions.map((action) => ACTION_DURATIONS[action.type]);
  const busy = durations.reduce((sum, d) => sum + d, 0);
  const padded = (seconds: number) => seconds + 2 * BEAT_PADDING;
  const narrationLength =
    beat.say === undefined ? undefined : (narrationSeconds ?? estimateNarration(beat.say));
  const duration = Math.max(
    padded(busy),
    narrationLength === undefined
      ? beat.caption.length / CAPTION_CHARS_PER_SECOND
      : padded(narrationLength),
  );

  const spare = durations.length === 0 ? 0 : (duration - padded(busy)) / durations.length;
  let at = BEAT_PADDING;
  const actions = durations.map((d) => {
    const slot = { at, duration: d };
    at += d + spare;
    return slot;
  });
  return {
    duration,
    ...(narrationLength === undefined
      ? {}
      : { narration: { at: BEAT_PADDING, length: narrationLength } }),
    actions,
  };
};
