import type { MusicMood } from "../schema/config.ts";
import { type Instrument, MOODS } from "./music-moods.ts";
import { seededRandom } from "./random.ts";
import type { Audio } from "./wav.ts";

/** Music is made at 48 kHz, the rate the mix and the video use. */
export const MUSIC_RATE = 48_000;
/** Every mood is brought to this loudness (RMS, dBFS); the config's volume is applied in the mix. */
export const MUSIC_RMS_DB = -22;
/** Peaks never go above this (dBFS), so the mix has headroom. */
const PEAK_DB = -1;

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

/** A pad starts this long before its bar and lasts this much longer, so chords swell into each other. */
const PAD_LEAD = 1.5;
const PAD_OVERLAP = 3;
const PULSE_LENGTH = 0.35;
/** Each note's loudness varies by up to this much either way, so repeats do not sound mechanical. */
const GAIN_SPREAD = 0.1;
const TAU = 2 * Math.PI;

/**
 * The notes of `seconds` of music in a mood. The seed picks the chord the
 * progression starts on, the arpeggio's pattern, each note's phase and a
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
  const offset = Math.floor(random() * spec.chords.length);
  const pattern = spec.arpeggio.patterns[Math.floor(random() * spec.arpeggio.patterns.length)] ?? [
    0,
  ];
  const notes: MusicNote[] = [];
  const add = (note: Omit<MusicNote, "phase">) => {
    if (note.at >= seconds || note.at + note.length <= 0) return;
    const gain = note.gain * (1 - GAIN_SPREAD + 2 * GAIN_SPREAD * random());
    notes.push({ ...note, gain, phase: random() * TAU });
  };
  const bars = Math.ceil(seconds / spec.bar) + 1;
  for (let bar = 0; bar < bars; bar++) {
    const chord = spec.chords[(bar + offset) % spec.chords.length] ?? [];
    const root = chord[0] ?? 0;
    const start = bar * spec.bar;
    if (spec.padGain !== undefined)
      for (const midi of chord) {
        const length = spec.bar + PAD_OVERLAP;
        add({ at: start - PAD_LEAD, length, midi, instrument: "pad", gain: spec.padGain });
      }
    // Overlapping its neighbours, as a pad does, so the drone holds steady instead of pumping each bar.
    if (spec.droneGain !== undefined)
      add({
        at: start - spec.bar / 2,
        length: 2 * spec.bar,
        midi: root - 12,
        instrument: "drone",
        gain: spec.droneGain,
      });
    const { arpeggio } = spec;
    for (let i = 0; i < arpeggio.perBar; i++) {
      const step = pattern[i % pattern.length] ?? 0;
      add({
        at: start + (i * spec.bar) / arpeggio.perBar,
        length: arpeggio.length,
        midi: (chord[step % chord.length] ?? root) + arpeggio.octave,
        instrument: arpeggio.instrument,
        gain: arpeggio.gain,
      });
    }
    if (spec.pulse)
      for (let i = 0; i < spec.pulse.perBar; i++)
        add({
          at: start + (i * spec.bar) / spec.pulse.perBar,
          length: PULSE_LENGTH,
          midi: root - 12,
          instrument: "pulse",
          gain: spec.pulse.gain,
        });
  }
  return { seconds, notes };
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** Rises from silence and falls back over a note's whole length. */
const swell = (t: number, length: number) => Math.sin((Math.PI * t) / length) ** 2;
/** A quick attack, then an exponential decay. */
const struck = (t: number, attack: number, decay: number) =>
  Math.min(1, t / attack) * Math.exp(-t * decay);
/** The prototype's pad: three sines detuned by ±0.12 %, each with an octave above, each its own phase. */
const PAD_DETUNES = [-0.0012, 0, 0.0012];
const PAD_OCTAVE = 0.008 / 0.06;

/**
 * Each short instrument's sound at `t` seconds into a note of `length`,
 * before its gain. The pad, most of the music's notes by length, has its
 * own faster path (`addPad`).
 */
const VOICES: Readonly<
  Record<
    Exclude<Instrument, "pad">,
    (t: number, length: number, f: number, phase: number) => number
  >
> = {
  pluck: (t, _length, f, phase) =>
    struck(t, 0.005, 2.2) *
    (Math.sin(TAU * f * t + phase) + 0.2 * Math.sin(TAU * 2 * f * t + phase)),
  // A third harmonic and a fast decay make it glassy.
  bell: (t, _length, f, phase) =>
    struck(t, 0.003, 8) * (Math.sin(TAU * f * t + phase) + 0.3 * Math.sin(TAU * 3 * f * t + phase)),
  // A soft kick: the pitch falls from an octave up to the note as the thump fades.
  pulse: (t, _length, f) =>
    struck(t, 0.002, 9) * Math.sin(TAU * f * (t + (1 - Math.exp(-t * 20)) / 20)),
  drone: (t, length, f, phase) =>
    swell(t, length) * (Math.sin(TAU * f * t + phase) + 0.25 * Math.sin(TAU * 2 * f * t)),
};

/** Every note ends with this short fade, so a cut never clicks. */
const RELEASE = 0.02;
const FADE_IN = 3;
const FADE_OUT = 5;
/** The prototype's space: three feed-forward echoes 0.38 s apart, at 0.32 each. */
const ECHO = { delay: 0.38, gain: 0.32, passes: 3 };
/** The prototype's lowpass, a 15-point Hann window at 24 kHz: the same time span at 48 kHz. */
const LOWPASS_TAPS = 29;

/**
 * Adds a pad note: `swell(t) · Σ [sin(2π·f·(1+d)·t + p) + PAD_OCTAVE · sin(2π·2f·t + p)]`
 * over the three detunes d, each with its own phase p. Each sine is a
 * phasor turned by a fixed step every sample rather than a `Math.sin`, and
 * the swell, sin²(πt/L) = (1 − cos(2πt/L)) / 2, is one more: the same
 * sound, several times faster.
 */
const addPad = (out: Float32Array, note: MusicNote, from: number, to: number) => {
  const f = hz(note.midi);
  const start = from / MUSIC_RATE - note.at;
  const partials = PAD_DETUNES.flatMap((detune, k) => {
    const phase = note.phase + (k * TAU) / PAD_DETUNES.length;
    return [
      { hz: f * (1 + detune), amplitude: 1, phase },
      { hz: 2 * f, amplitude: PAD_OCTAVE, phase },
    ];
  });
  // The swell's cosine is the last phasor.
  partials.push({ hz: 1 / note.length, amplitude: 0, phase: Math.PI / 2 });
  const count = partials.length;
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  const stepRe = new Float64Array(count);
  const stepIm = new Float64Array(count);
  for (const [k, partial] of partials.entries()) {
    const angle = TAU * partial.hz * start + partial.phase;
    re[k] = Math.cos(angle);
    im[k] = Math.sin(angle);
    stepRe[k] = Math.cos((TAU * partial.hz) / MUSIC_RATE);
    stepIm[k] = Math.sin((TAU * partial.hz) / MUSIC_RATE);
  }
  const amplitude = partials.map((p) => p.amplitude);
  const swellAt = count - 1;
  for (let i = from; i < to; i++) {
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const r = re[k] ?? 0;
      const m = im[k] ?? 0;
      sum += (amplitude[k] ?? 0) * m;
      re[k] = r * (stepRe[k] ?? 1) - m * (stepIm[k] ?? 0);
      im[k] = r * (stepIm[k] ?? 0) + m * (stepRe[k] ?? 1);
    }
    // The swell phasor started at a quarter turn, so its imaginary part is cos(2πt/L).
    const swelling = (1 - (im[swellAt] ?? 1)) / 2;
    const t = i / MUSIC_RATE - note.at;
    const release = Math.min(1, (note.length - t) / RELEASE);
    out[i] = (out[i] ?? 0) + note.gain * release * swelling * sum;
  }
};

/**
 * Plays a plan into samples at 48 kHz: every note on its instrument, then
 * the prototype's mastering (a soft lowpass, an echo for space, a fade in
 * and out) and one loudness for every mood, with peaks under −1 dBFS.
 * `master: false` gives the bare notes, to check an instrument on its own.
 */
export const renderMusic = (plan: MusicPlan, { master = true } = {}): Audio => {
  const n = Math.round(plan.seconds * MUSIC_RATE);
  const out = new Float32Array(n);
  for (const note of plan.notes) {
    const from = Math.max(0, Math.ceil(note.at * MUSIC_RATE));
    const to = Math.min(n, Math.floor((note.at + note.length) * MUSIC_RATE));
    if (note.instrument === "pad") {
      addPad(out, note, from, to);
      continue;
    }
    const voice = VOICES[note.instrument];
    const f = hz(note.midi);
    for (let i = from; i < to; i++) {
      const t = i / MUSIC_RATE - note.at;
      const release = Math.min(1, (note.length - t) / RELEASE);
      out[i] = (out[i] ?? 0) + note.gain * release * voice(t, note.length, f, note.phase);
    }
  }
  if (!master) return { samples: out, sampleRate: MUSIC_RATE };
  const fades = fadesFor(plan.seconds);
  const mastered = faded(echoed(lowpassed(out)), plan.seconds, fades);
  return { samples: atLoudness(mastered, fades), sampleRate: MUSIC_RATE };
};

const lowpassed = (samples: Float32Array): Float32Array => {
  const window = Array.from(
    { length: LOWPASS_TAPS },
    (_, k) => Math.sin((Math.PI * (k + 1)) / (LOWPASS_TAPS + 1)) ** 2,
  );
  const total = window.reduce((sum, w) => sum + w, 0);
  const half = (LOWPASS_TAPS - 1) / 2;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let k = 0; k < LOWPASS_TAPS; k++) sum += (window[k] ?? 0) * (samples[i + k - half] ?? 0);
    out[i] = sum / total;
  }
  return out;
};

/** Each pass adds a copy `delay` later, from before the pass: the prototype's `lp[d:] += lp[:-d] * g`. */
const echoed = (samples: Float32Array): Float32Array => {
  const delay = Math.round(ECHO.delay * MUSIC_RATE);
  for (let pass = 0; pass < ECHO.passes; pass++)
    for (let i = samples.length - 1; i >= delay; i--)
      samples[i] = (samples[i] ?? 0) + ECHO.gain * (samples[i - delay] ?? 0);
  return samples;
};

type Fades = { readonly in: number; readonly out: number };

/** 3 s in and 5 s out, shortened on short music so at least half of it is at full level. */
const fadesFor = (seconds: number): Fades => ({
  in: Math.min(FADE_IN, seconds / 4),
  out: Math.min(FADE_OUT, seconds / 4),
});

const faded = (samples: Float32Array, seconds: number, fades: Fades): Float32Array => {
  for (let i = 0; i < samples.length; i++) {
    const t = i / MUSIC_RATE;
    const level = Math.max(0, Math.min(1, t / fades.in, (seconds - t) / fades.out));
    samples[i] = (samples[i] ?? 0) * level;
  }
  return samples;
};

/** Scales to the music's loudness, measured between the fades, then down further if a peak would pass −1 dBFS. */
const atLoudness = (samples: Float32Array, fades: Fades): Float32Array => {
  const steady = samples.subarray(
    Math.round(fades.in * MUSIC_RATE),
    samples.length - Math.round(fades.out * MUSIC_RATE),
  );
  let sum = 0;
  for (const s of steady) sum += s * s;
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const rms = Math.sqrt(sum / Math.max(1, steady.length));
  if (rms === 0) return samples;
  const gain = Math.min(10 ** (MUSIC_RMS_DB / 20) / rms, 10 ** (PEAK_DB / 20) / peak);
  return samples.map((s) => s * gain);
};
