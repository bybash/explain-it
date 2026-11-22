import { MUSIC_DUCK_DB } from "../schema/config.ts";
import { AUDIO_RATE, dbToGain, soundingRms } from "./level.ts";
import type { Audio } from "./wav.ts";

/** The voice is levelled to this loudness (RMS while it speaks, dBFS), as in the prototype. */
export const VOICE_RMS_DB = -18;
/** The dip eases in and out over this long, so the music does not pump. */
const DUCK_EASE = 0.35;
/** A sample louder than this counts as speech. */
const SPEECH_THRESHOLD = 0.01;

/** Input samples either side of each output sample in the resampling filter. */
const RESAMPLE_HALF_WIDTH = 24;

/**
 * Audio at another rate, by windowed-sinc interpolation (a Blackman window),
 * cut off at the lower rate's Nyquist frequency so going up from Kokoro's
 * 24 kHz leaves no audible images above 12 kHz.
 */
export const resample = ({ samples, sampleRate }: Audio, rate: number): Float32Array => {
  if (sampleRate === rate) return samples;
  const length = Math.round((samples.length * rate) / sampleRate);
  const ratio = sampleRate / rate;
  // Going down, the cutoff falls with the new rate.
  const scale = Math.min(1, rate / sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = i * ratio;
    const centre = Math.floor(x);
    let sum = 0;
    for (let k = centre - RESAMPLE_HALF_WIDTH + 1; k <= centre + RESAMPLE_HALF_WIDTH; k++) {
      const d = x - k;
      const w = d / RESAMPLE_HALF_WIDTH;
      if (Math.abs(w) >= 1) continue;
      const window = 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w);
      const arg = Math.PI * d * scale;
      const sinc = arg === 0 ? 1 : Math.sin(arg) / arg;
      sum += (samples[k] ?? 0) * sinc * window * scale;
    }
    out[i] = sum;
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
  const track = new Float32Array(Math.round(seconds * AUDIO_RATE));
  for (const line of lines) {
    const samples = resample(line.audio, AUDIO_RATE);
    const start = Math.round(line.at * AUDIO_RATE);
    for (let i = 0; i < samples.length && start + i < track.length; i++)
      if (start + i >= 0) track[start + i] = (track[start + i] ?? 0) + (samples[i] ?? 0);
  }
  const level = soundingRms(track);
  if (level === 0) return track;
  const gain = dbToGain(VOICE_RMS_DB) / level;
  return track.map((s) => s * gain);
};

/**
 * Where the voice speaks, from 0 to 1: speech smoothed over `DUCK_EASE`,
 * then tripled and capped (the prototype's envelope), so the music starts
 * to dip a little before a line, is fully down just before it, and comes
 * back as quickly just after it.
 */
export const speakingEnvelope = (voice: Float32Array): Float32Array => {
  const width = Math.max(1, Math.round(DUCK_EASE * AUDIO_RATE));
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
 * nobody speaks, and `MUSIC_DUCK_DB` further down while the voice does.
 */
export const duckedMusic = (
  music: Audio,
  speaking: Float32Array,
  volumeDb: number,
): Float32Array => {
  const samples = resample(music, AUDIO_RATE);
  // Measured where it sounds, as the voice is, so fades and rests do not lift it.
  const own = soundingRms(samples);
  if (own === 0) return samples;
  const base = dbToGain(VOICE_RMS_DB + volumeDb) / own;
  return samples.map((s, i) => s * base * dbToGain(MUSIC_DUCK_DB * (speaking[i] ?? 0)));
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
  return { samples: headroom === 1 ? mix : mix.map((s) => s * headroom), sampleRate: AUDIO_RATE };
};
