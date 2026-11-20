import { NARRATION_LINES } from "../overlays/regions.ts";

/** Characters on one caption line: the usual subtitle limit, which fits the band at every size. */
const LINE_CHARS = 42;
/** The most characters one narration cue may show: as many lines as the band holds. */
export const MAX_CUE_CHARS = LINE_CHARS * NARRATION_LINES;

/** Where a line may break, from the best place to the worst: sentences, clauses, words. */
const BREAKS = [/(?<=[.!?])\s+/, /(?<=[,;:])\s+/, /\s+/] as const;

/**
 * Splits a narration line into cues that each fit the narration band: between
 * sentences where it can, else between clauses, else between words. Pieces
 * are packed into a cue while they fit. Only a single word longer than a cue
 * can make one too long.
 */
export const splitCues = (say: string): string[] => split(say.trim().replace(/\s+/g, " "), 0);

const split = (text: string, level: number): string[] => {
  const pattern = BREAKS[level];
  if (text.length <= MAX_CUE_CHARS || pattern === undefined) return [text];
  const pieces = text.split(pattern).flatMap((piece) => split(piece, level + 1));
  return pack(pieces);
};

const pack = (pieces: readonly string[]): string[] => {
  const cues: string[] = [];
  for (const piece of pieces) {
    const last = cues.at(-1);
    if (last !== undefined && last.length + 1 + piece.length <= MAX_CUE_CHARS)
      cues[cues.length - 1] = `${last} ${piece}`;
    else cues.push(piece);
  }
  return cues;
};
