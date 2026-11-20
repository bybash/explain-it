/** A caption line and when it is on screen, in seconds. */
export type SrtCue = { readonly start: number; readonly end: number; readonly text: string };

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** `HH:MM:SS,mmm`, rounded to the nearest millisecond. */
const timestamp = (seconds: number): string => {
  const ms = Math.round(seconds * 1000);
  const [h, m, s] = [
    Math.floor(ms / 3_600_000),
    Math.floor(ms / 60_000) % 60,
    Math.floor(ms / 1000) % 60,
  ];
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms % 1000, 3)}`;
};

/** SubRip text for the cues: numbered from 1, a blank line between them. */
export const toSrt = (cues: readonly SrtCue[]): string =>
  cues
    .map((cue, i) => `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`)
    .join("\n");
