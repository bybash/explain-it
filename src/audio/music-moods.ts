import type { MusicMood } from "../schema/config.ts";

export const INSTRUMENTS = ["pad", "pluck", "bell", "pulse", "drone"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** A mood as data: its chords, one a bar, and what plays over them (decision 014). */
export type MoodSpec = {
  /** MIDI notes; the seed picks which chord the progression starts on. */
  readonly chords: readonly (readonly number[])[];
  /** Seconds a chord lasts: the tempo. */
  readonly bar: number;
  /** A sustained chord under everything, at this gain. */
  readonly padGain?: number;
  /** The chord's root held an octave down, at this gain. */
  readonly droneGain?: number;
  readonly arpeggio: {
    readonly instrument: Instrument;
    readonly perBar: number;
    /** Semitones above the chord. */
    readonly octave: number;
    readonly length: number;
    readonly gain: number;
    /** Indexes into the chord; the seed picks one pattern. */
    readonly patterns: readonly (readonly number[])[];
  };
  /** A soft low thump on each beat. */
  readonly pulse?: { readonly perBar: number; readonly gain: number };
};

const beats = (bpm: number) => (4 * 60) / bpm;

export const MOODS: Readonly<Record<MusicMood, MoodSpec>> = {
  // The prototype: Cmaj9, Am9, Fmaj9, G6, 8 s a chord, with a high pluck six times a bar.
  calm: {
    chords: [
      [48, 55, 59, 62, 64],
      [45, 52, 55, 59, 64],
      [41, 48, 52, 55, 57],
      [43, 50, 55, 59, 64],
    ],
    bar: 8,
    padGain: 0.06,
    arpeggio: {
      instrument: "pluck",
      perBar: 6,
      octave: 24,
      length: 2.5,
      gain: 0.05,
      // The first is the prototype's (every other chord tone); all stay within the chord's octave.
      patterns: [
        [0, 2, 4, 1, 3, 0],
        [0, 1, 2, 3, 4, 2],
        [4, 2, 0, 3, 1, 4],
      ],
    },
  },
  // D, A, Bm, G (I–V–vi–IV): a light pad, a bouncy eighth-note pluck and a pulse on the beat.
  upbeat: {
    chords: [
      [50, 57, 62, 66, 69],
      [45, 52, 57, 61, 64],
      [47, 54, 59, 62, 66],
      [43, 50, 55, 59, 62],
    ],
    bar: beats(100),
    padGain: 0.035,
    arpeggio: {
      instrument: "pluck",
      perBar: 8,
      octave: 12,
      length: 0.8,
      gain: 0.05,
      patterns: [
        [0, 2, 4, 2, 1, 3, 4, 3],
        [0, 1, 2, 3, 4, 3, 2, 1],
        [0, 4, 2, 4, 1, 4, 3, 4],
      ],
    },
    pulse: { perBar: 4, gain: 0.12 },
  },
  // Dm9, B♭maj7, Fmaj7, C: sixteenth-note glassy notes over a held drone, no pad.
  technical: {
    chords: [
      [50, 53, 57, 60, 64],
      [46, 53, 57, 62],
      [41, 48, 52, 57],
      [48, 55, 60, 64],
    ],
    bar: beats(110),
    droneGain: 0.05,
    arpeggio: {
      instrument: "bell",
      perBar: 16,
      octave: 24,
      length: 0.4,
      gain: 0.035,
      patterns: [
        [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
        [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 2, 4, 3, 1],
        [0, 3, 1, 4, 2, 0, 3, 1, 4, 2, 0, 3, 1, 4, 2, 4],
      ],
    },
  },
};
