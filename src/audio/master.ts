import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { LOUDNESS } from "../schema/checks.ts";
import { AUDIO_RATE, dbToGain, soundingRms } from "./level.ts";
import { type Audio, encodeWav } from "./wav.ts";

const run = promisify(execFile);

/** loudnorm can overshoot its true-peak target slightly, so it aims a little lower. */
const AIM_TRUE_PEAK = -1.5;
const RANGE_LU = 11;

/** A loudnorm measurement: a number, or minus infinity for silence. */
const Level = z.string().regex(/^-?(\d+(\.\d+)?|inf)$/);
/** What loudnorm's first pass prints, checked before it goes back into the second. */
const MeasuredSchema = z.object({
  input_i: Level,
  input_tp: Level,
  input_lra: Level,
  input_thresh: Level,
  target_offset: Level,
});

const loudnorm = (extra = "") =>
  `loudnorm=I=${LOUDNESS.target}:TP=${AIM_TRUE_PEAK}:LRA=${RANGE_LU}${extra}`;

/** How far above its own level the mix may peak before the limiter catches it. */
const PEAK_ABOVE_LEVEL_DB = 13;

/**
 * A short-attack limiter set `PEAK_ABOVE_LEVEL_DB` above the mix's level
 * while it sounds. Kokoro's plosives peak about 22 dB over the speech
 * (the music about 14): left alone, they cap the gain loudnorm may apply,
 * and the example stayed at −17.1 LUFS. Only those spikes are touched,
 * about 0.5 % of the example's samples.
 */
const peakLimiter = ({ samples }: Audio): string => {
  // alimiter takes a limit from 1/16 to 1; a quiet mix is limited no lower than that.
  const limit = Math.min(
    0.99,
    Math.max(1 / 16, soundingRms(samples) * dbToGain(PEAK_ABOVE_LEVEL_DB)),
  );
  return `alimiter=limit=${limit.toFixed(4)}:attack=2:release=80:level=false`;
};

/** The mix scaled so its loudest sample is just under full scale. */
const toFullScale = (mix: Audio): Audio => {
  let peak = 0;
  for (const s of mix.samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return mix;
  const gain = 0.99 / peak;
  return { ...mix, samples: mix.samples.map((s) => s * gain) };
};

/**
 * Writes the mix to `out` as 16-bit WAV at 48 kHz, at −16 LUFS with true
 * peaks at or below −1 dBTP. The mix's spikes are limited first; then
 * ffmpeg's loudnorm measures it and applies one gain from what it measured
 * (two passes, linear), so speech and pauses keep their balance.
 */
export const masterAudio = async (mix: Audio, out: string, signal?: AbortSignal): Promise<void> => {
  const raw = `${out}.mix.wav`;
  // Brought to full scale first: loudnorm sets the level anyway, and a quiet mix
  // (music alone at a low volumeDb) would otherwise round towards silence in 16 bits.
  const full = toFullScale(mix);
  await writeFile(raw, encodeWav(full));
  const limiter = peakLimiter(full);
  try {
    const first = await run(
      "ffmpeg",
      [
        ...["-hide_banner", "-nostats", "-i", raw],
        ...["-af", `${limiter},${loudnorm(":print_format=json")}`, "-f", "null", "-"],
      ],
      { signal },
    );
    const json = first.stderr.slice(first.stderr.lastIndexOf("{"));
    const measured = MeasuredSchema.parse(JSON.parse(json.slice(0, json.indexOf("}") + 1)));
    const known = [
      `:measured_I=${measured.input_i}`,
      `:measured_TP=${measured.input_tp}`,
      `:measured_LRA=${measured.input_lra}`,
      `:measured_thresh=${measured.input_thresh}`,
      `:offset=${measured.target_offset}`,
      ":linear=true",
    ].join("");
    await run(
      "ffmpeg",
      [
        ...["-y", "-loglevel", "error", "-i", raw],
        ...[
          "-af",
          `${limiter},${loudnorm(known)}`,
          "-ar",
          String(AUDIO_RATE),
          "-c:a",
          "pcm_s16le",
          out,
        ],
      ],
      { signal },
    );
  } finally {
    await rm(raw, { force: true });
  }
};

export type Loudness = {
  /** Integrated loudness, LUFS. */
  readonly integrated: number;
  /** True peak, dBTP. */
  readonly truePeak: number;
  readonly seconds: number;
  readonly sampleRate: number;
};

/** Measures a file with ffmpeg's EBU R128 meter (ebur128), as the loudness check does. */
export const measureLoudness = async (file: string): Promise<Loudness> => {
  const { stderr } = await run("ffmpeg", [
    ...["-hide_banner", "-nostats", "-i", file],
    ...["-af", "ebur128=peak=true", "-f", "null", "-"],
  ]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const number = (pattern: RegExp, text = summary) =>
    Number(text.match(pattern)?.[1] ?? Number.NaN);
  const duration = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return {
    integrated: number(/I:\s+(-?[\d.]+) LUFS/),
    truePeak: number(/Peak:\s+(-?[\d.]+|-inf) dBFS/),
    seconds: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : Number.NaN,
    sampleRate: number(/, (\d+) Hz,/, stderr),
  };
};
