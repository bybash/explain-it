import type { MUSIC_MOODS } from "../schema/config.ts";
import { seededRandom } from "./random.ts";
import type { Audio } from "./wav.ts";

export type MusicMood = (typeof MUSIC_MOODS)[number];

/** Music is made at 48 kHz, the rate the mix and the video use. */
export const MUSIC_RATE = 48_000;
/** Every mood is brought to this loudness (RMS, dBFS); the config's volume is applied in the mix. */
export const MUSIC_RMS_DB = -22;
/** Peaks never go above this (dBFS), so the mix has headroom. */
const PEAK_DB = -1;

const INSTRUMENTS = ["pad", "pluck", "bell", "pulse", "drone"] as const;
type Instrument = (typeof INSTRUMENTS)[number];

/** One note of the music: when, how long, which pitch, on what, how loud. */
export type MusicNote = {
  readonly at: number;
  readonly length: number;
  /** MIDI note number: 60 is middle C. */
  readonly midi: number;
  readonly instrument: Instrument;
  readonly gain: number;
  /** Where the note's wave starts, in radians, so stacked notes do not sum in phase. */
  readonly phase: number;
};

export type MusicPlan = { readonly seconds: number; readonly notes: readonly MusicNote[] };

/**
 * Each mood as data: its chords (MIDI), one chord a bar, and what plays
 * over them. calm is the prototype's warm pad with sparse plucks; upbeat a
 * brighter major with a bouncy arpeggio and a soft pulse on the beat;
 * technical a cool modal sequence of short glassy notes over a drone.
 */
const MOODS: Readonly<
  Record<
    MusicMood,
    {
      readonly chords: readonly (readonly number[])[];
      readonly bar: number;
      readonly pad?: number;
      readonly drone?: number;
      readonly arpeggio: {
        readonly instrument: Instrument;
        readonly perBar: number;
        readonly octave: number;
        readonly length: number;
        readonly gain: number;
        readonly patterns: readonly (readonly number[])[];
      };
      readonly pulse?: { readonly perBar: number; readonly gain: number };
    }
  >
> = {
  calm: {
    // Cmaj9, Am9, Fmaj9, G6; 8 s a chord, about 60 bpm.
    chords: [
      [48, 55, 59, 62, 64],
      [45, 52, 55, 59, 64],
      [41, 48, 52, 55, 57],
      [43, 50, 55, 59, 64],
    ],
    bar: 8,
    pad: 0.06,
    arpeggio: {
      instrument: "pluck",
      perBar: 6,
      octave: 24,
      length: 2.5,
      gain: 0.05,
      patterns: [
        [0, 2, 4, 1, 3, 0],
        [0, 2, 4, 6, 8, 10],
        [4, 2, 0, 3, 1, 4],
      ],
    },
  },
  upbeat: {
    // D, A, Bm, G (I–V–vi–IV) at 100 bpm, a bar a chord.
    chords: [
      [50, 57, 62, 66, 69],
      [45, 52, 57, 61, 64],
      [47, 54, 59, 62, 66],
      [43, 50, 55, 59, 62],
    ],
    bar: 2.4,
    pad: 0.035,
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
  technical: {
    // Dm9, B♭maj7, Fmaj7, C at 110 bpm, a bar a chord.
    chords: [
      [50, 53, 57, 60, 64],
      [46, 53, 57, 62],
      [41, 48, 52, 57],
      [48, 55, 60, 64],
    ],
    bar: (4 * 60) / 110,
    drone: 0.05,
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

/** A pad starts this long before its bar and swells over this much extra, so chords overlap. */
const PAD_LEAD = 1.5;
const PAD_OVERLAP = 3;

/**
 * The notes of `seconds` of music in a mood. The seed picks where the chord
 * progression starts, the arpeggio's pattern, each note's phase and a
 * little variation in loudness: the same seed always gives the same notes.
 */
export const musicPlan = ({
  mood,
  seed,
  seconds,
}: {
  readonly mood: MusicMood;
  readonly seed: number;
  readonly seconds: number;
}): MusicPlan => {
  const spec = MOODS[mood];
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const offset = Math.floor(random() * spec.chords.length);
  const pattern = pick(spec.arpeggio.patterns);
  const notes: MusicNote[] = [];
  const add = (note: Omit<MusicNote, "phase" | "gain"> & { gain: number }) => {
    if (note.at < seconds && note.at + note.length > 0)
      notes.push({
        ...note,
        gain: note.gain * (0.9 + 0.2 * random()),
        phase: random() * 2 * Math.PI,
      });
  };
  const bars = Math.ceil(seconds / spec.bar) + 1;
  for (let bar = 0; bar < bars; bar++) {
    const chord = spec.chords[(bar + offset) % spec.chords.length] ?? [];
    const start = bar * spec.bar;
    if (spec.pad !== undefined)
      for (const midi of chord)
        add({
          at: start - PAD_LEAD,
          length: spec.bar + PAD_OVERLAP,
          midi,
          instrument: "pad",
          gain: spec.pad,
        });
    if (spec.drone !== undefined)
      // Overlapping its neighbours, as a pad does, so the drone holds steady instead of pumping each bar.
      add({
        at: start - spec.bar / 2,
        length: 2 * spec.bar,
        midi: (chord[0] ?? 48) - 12,
        instrument: "drone",
        gain: spec.drone,
      });
    const { arpeggio } = spec;
    for (let i = 0; i < arpeggio.perBar; i++) {
      const step = pattern[i % pattern.length] ?? 0;
      const tone = chord[step % chord.length] ?? 60;
      add({
        at: start + (i * spec.bar) / arpeggio.perBar,
        length: arpeggio.length,
        midi: tone + arpeggio.octave + 12 * Math.floor(step / chord.length),
        instrument: arpeggio.instrument,
        gain: arpeggio.gain,
      });
    }
    if (spec.pulse)
      for (let i = 0; i < spec.pulse.perBar; i++)
        add({
          at: start + (i * spec.bar) / spec.pulse.perBar,
          length: 0.35,
          midi: (chord[0] ?? 48) - 24,
          instrument: "pulse",
          gain: spec.pulse.gain,
        });
  }
  return { seconds, notes };
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const TAU = 2 * Math.PI;

/** Each instrument's sound at `t` seconds into a note of `length`, before its gain. */
const VOICES: Readonly<
  Record<Instrument, (t: number, length: number, f: number, phase: number) => number>
> = {
  // Three slightly detuned sines and a soft octave, swelling in and out (the prototype's pad).
  pad: (t, length, f, phase) => {
    const swell = Math.sin((Math.PI * t) / length) ** 2;
    let sum = 0;
    for (const detune of [-0.0012, 0, 0.0012]) sum += Math.sin(TAU * f * (1 + detune) * t + phase);
    return swell * (sum + (0.008 / 0.06) * Math.sin(TAU * 2 * f * t + phase));
  },
  // A soft pluck: a quick attack, then a long decay.
  pluck: (t, _length, f, phase) =>
    Math.min(1, t / 0.005) *
    Math.exp(-t * 2.2) *
    (Math.sin(TAU * f * t + phase) + 0.2 * Math.sin(TAU * 2 * f * t + phase)),
  // A short glassy tone: a fundamental and a third harmonic, decaying fast.
  bell: (t, _length, f, phase) =>
    Math.min(1, t / 0.003) *
    Math.exp(-t * 8) *
    (Math.sin(TAU * f * t + phase) + 0.3 * Math.sin(TAU * 3 * f * t + phase)),
  // A soft low thump: the pitch falls by an octave as it fades.
  pulse: (t, _length, f) =>
    Math.min(1, t / 0.002) *
    Math.exp(-t * 9) *
    Math.sin(TAU * f * 2 * (t - (1 - Math.exp(-t * 20)) / 40)),
  // A low held tone, swelling in and out over its bar.
  drone: (t, length, f, phase) =>
    Math.sin((Math.PI * t) / length) ** 2 *
    (Math.sin(TAU * f * t + phase) + 0.25 * Math.sin(TAU * 2 * f * t)),
};

const FADE_IN = 3;
const FADE_OUT = 5;
const ECHO = { delay: 0.38, feedback: 0.3 };
const LOWPASS_HZ = 6_000;

/**
 * Plays a plan into samples at 48 kHz: every note on its instrument, then a
 * soft lowpass, an echo for space, a fade in and out, and one loudness for
 * every mood, with peaks under −1 dBFS.
 */
export const renderMusic = (plan: MusicPlan): Audio => {
  const n = Math.round(plan.seconds * MUSIC_RATE);
  const out = new Float32Array(n);
  for (const note of plan.notes) {
    const voice = VOICES[note.instrument];
    const f = hz(note.midi);
    const from = Math.max(0, Math.ceil(note.at * MUSIC_RATE));
    const to = Math.min(n, Math.floor((note.at + note.length) * MUSIC_RATE));
    for (let i = from; i < to; i++) {
      const t = i / MUSIC_RATE - note.at;
      out[i] = (out[i] ?? 0) + note.gain * voice(t, note.length, f, note.phase);
    }
  }
  // A one-pole lowpass softens the top; a feedback echo adds space.
  const a = 1 - Math.exp((-TAU * LOWPASS_HZ) / MUSIC_RATE);
  let held = 0;
  const delay = Math.round(ECHO.delay * MUSIC_RATE);
  for (let i = 0; i < n; i++) {
    held += a * ((out[i] ?? 0) - held);
    out[i] = held + (i >= delay ? ECHO.feedback * (out[i - delay] ?? 0) : 0);
  }
  for (let i = 0; i < n; i++) {
    const t = i / MUSIC_RATE;
    const fade = Math.max(0, Math.min(1, t / FADE_IN, (plan.seconds - t) / FADE_OUT));
    out[i] = (out[i] ?? 0) * fade;
  }
  return { samples: atLoudness(out), sampleRate: MUSIC_RATE };
};

/**
 * Scales samples to the music's loudness, measured between the fades (or
 * over all of it when the music is too short to have a middle), then down
 * further if a peak would pass −1 dBFS.
 */
const atLoudness = (samples: Float32Array): Float32Array => {
  const from = Math.round(FADE_IN * MUSIC_RATE);
  const to = samples.length - Math.round(FADE_OUT * MUSIC_RATE);
  const steady = to > from ? samples.subarray(from, to) : samples;
  let sum = 0;
  for (const s of steady) sum += s * s;
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const rms = Math.sqrt(sum / Math.max(1, steady.length));
  if (rms === 0) return samples;
  const gain = Math.min(10 ** (MUSIC_RMS_DB / 20) / rms, 10 ** (PEAK_DB / 20) / peak);
  return samples.map((s) => s * gain);
};
