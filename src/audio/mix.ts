import type { Audio } from "./wav.ts";

/** The mix, the music and the video's audio track are at 48 kHz. */
export const MIX_RATE = 48_000;
/** The voice is levelled to this loudness (RMS while it speaks, dBFS), as in the prototype. */
export const VOICE_RMS_DB = -18;
/** How much further the music dips while the voice speaks. */
export const DUCK_DB = -6;
/** The dip eases in and out over this long, so the music does not pump. */
const DUCK_EASE = 0.35;
/** A sample louder than this counts as speech. */
const SPEECH_THRESHOLD = 0.01;
/** Below this, a sample is silence when the voice is levelled. */
const SILENCE = 1e-3;

const dbGain = (db: number) => 10 ** (db / 20);

/** Audio at another rate, by linear interpolation: enough for speech going up from 24 kHz. */
export const resample = ({ samples, sampleRate }: Audio, rate: number): Float32Array => {
  if (sampleRate === rate) return samples;
  const length = Math.round((samples.length * rate) / sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = (i * sampleRate) / rate;
    const j = Math.floor(x);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
};

/** A narration line and when it starts, in seconds from the start of the video. */
export type PlacedLine = { readonly at: number; readonly audio: Audio };

/**
 * The voice track: every line at its time, cut at the end, and the whole
 * track levelled so it speaks at `VOICE_RMS_DB`.
 */
export const voiceTrack = (lines: readonly PlacedLine[], seconds: number): Float32Array => {
  const track = new Float32Array(Math.round(seconds * MIX_RATE));
  for (const line of lines) {
    const samples = resample(line.audio, MIX_RATE);
    const start = Math.round(line.at * MIX_RATE);
    for (let i = 0; i < samples.length && start + i < track.length; i++)
      if (start + i >= 0) track[start + i] = (track[start + i] ?? 0) + (samples[i] ?? 0);
  }
  let sum = 0;
  let count = 0;
  for (const s of track)
    if (Math.abs(s) > SILENCE) {
      sum += s * s;
      count++;
    }
  if (count === 0) return track;
  const gain = dbGain(VOICE_RMS_DB) / Math.sqrt(sum / count);
  return track.map((s) => s * gain);
};

/**
 * Where the voice speaks, from 0 to 1: speech smoothed over 0.35 s, then
 * tripled and capped, so the music dips just before a line and comes back
 * just after it (the prototype's envelope).
 */
export const speakingEnvelope = (voice: Float32Array): Float32Array => {
  const width = Math.max(1, Math.round(DUCK_EASE * MIX_RATE));
  const half = Math.floor(width / 2);
  const speaking = voice.map((s) => (Math.abs(s) > SPEECH_THRESHOLD ? 1 : 0));
  const out = new Float32Array(voice.length);
  let inWindow = 0;
  for (let i = -half; i < voice.length; i++) {
    inWindow += (speaking[i + half] ?? 0) - (speaking[i - half - 1] ?? 0);
    if (i >= 0) out[i] = Math.min(1, (3 * inWindow) / width);
  }
  return out;
};

/**
 * The music under the voice: `volumeDb` below the voice's loudness while
 * nobody speaks, and `DUCK_DB` further down while the voice does.
 */
export const duckedMusic = (
  music: Audio,
  speaking: Float32Array,
  volumeDb: number,
): Float32Array => {
  const samples = resample(music, MIX_RATE);
  const own = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / Math.max(1, samples.length));
  if (own === 0) return samples;
  const base = dbGain(VOICE_RMS_DB + volumeDb) / own;
  return samples.map((s, i) => s * base * dbGain(DUCK_DB * (speaking[i] ?? 0)));
};

/**
 * The voice and the ducked music, mixed for `seconds`; undefined when there
 * is neither. Kept under full scale; `master.ts` sets the final loudness.
 */
export const mixAudio = ({
  seconds,
  lines,
  music,
  volumeDb,
}: {
  readonly seconds: number;
  readonly lines: readonly PlacedLine[];
  readonly music?: Audio;
  readonly volumeDb: number;
}): Audio | undefined => {
  if (lines.length === 0 && !music) return undefined;
  const voice = voiceTrack(lines, seconds);
  const mix = Float32Array.from(voice);
  if (music) {
    const under = duckedMusic(music, speakingEnvelope(voice), volumeDb);
    for (let i = 0; i < mix.length; i++) mix[i] = (mix[i] ?? 0) + (under[i] ?? 0);
  }
  let peak = 0;
  for (const s of mix) peak = Math.max(peak, Math.abs(s));
  const headroom = peak > 0.99 ? 0.99 / peak : 1;
  return { samples: headroom === 1 ? mix : mix.map((s) => s * headroom), sampleRate: MIX_RATE };
};
