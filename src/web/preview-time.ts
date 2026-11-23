import type { BeatSpan } from "./preview-protocol.ts";

/** The beat playing at `t`, or none while a card shows or between scenes. */
export const beatAt = <B extends BeatSpan>(beats: readonly B[], t: number): B | undefined =>
  beats.find((beat) => t >= beat.start && t < beat.end);

/** A time in the video as a clock shows it: `1:20`. */
export const clockTime = (t: number): string =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
