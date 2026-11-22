import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { MIX_RATE } from "./mix.ts";
import { type Audio, encodeWav } from "./wav.ts";

const run = promisify(execFile);

/** SPEC, Mix: integrated loudness, and the true peak never above −1 dBTP. */
export const TARGET_LUFS = -16;
export const MAX_TRUE_PEAK = -1;
/** loudnorm can overshoot its true-peak target slightly, so it aims a little lower. */
const AIM_TRUE_PEAK = -1.5;
const RANGE_LU = 11;

type Measured = {
  readonly input_i: string;
  readonly input_tp: string;
  readonly input_lra: string;
  readonly input_thresh: string;
  readonly target_offset: string;
};

const loudnorm = (extra = "") =>
  `loudnorm=I=${TARGET_LUFS}:TP=${AIM_TRUE_PEAK}:LRA=${RANGE_LU}${extra}`;

/** How far above its own level the mix may peak before the limiter catches it. */
const PEAK_ABOVE_LEVEL_DB = 13;
/** Quiet enough to count as silence when measuring the mix's level. */
const SILENCE = 1e-3;

/**
 * A short-attack limiter set `PEAK_ABOVE_LEVEL_DB` above the mix's level
 * while it sounds. Kokoro's plosives peak about 22 dB over the speech
 * (the music about 14): left alone, they cap the gain loudnorm may apply,
 * and the example stayed at −17.1 LUFS. Only those spikes are touched,
 * about 0.5 % of the example's samples.
 */
const peakLimiter = ({ samples }: Audio): string => {
  let sum = 0;
  let count = 0;
  for (const s of samples)
    if (Math.abs(s) > SILENCE) {
      sum += s * s;
      count++;
    }
  const level = Math.sqrt(sum / Math.max(1, count));
  const limit = Math.min(0.99, level * 10 ** (PEAK_ABOVE_LEVEL_DB / 20));
  return `alimiter=limit=${limit.toFixed(4)}:attack=2:release=80:level=false`;
};

/**
 * Writes the mix to `out` as 16-bit WAV at 48 kHz, at −16 LUFS with true
 * peaks at or below −1 dBTP. The mix's spikes are limited first; then
 * ffmpeg's loudnorm measures it and applies one gain from what it measured
 * (two passes, linear), so speech and pauses keep their balance.
 */
export const masterAudio = async (mix: Audio, out: string): Promise<void> => {
  const raw = `${out}.mix.wav`;
  await writeFile(raw, encodeWav(mix));
  const limiter = peakLimiter(mix);
  try {
    const first = await run("ffmpeg", [
      ...["-hide_banner", "-nostats", "-i", raw],
      ...["-af", `${limiter},${loudnorm(":print_format=json")}`, "-f", "null", "-"],
    ]);
    const json = first.stderr.slice(first.stderr.lastIndexOf("{"));
    const measured = JSON.parse(json.slice(0, json.indexOf("}") + 1)) as Measured;
    const known = [
      `:measured_I=${measured.input_i}`,
      `:measured_TP=${measured.input_tp}`,
      `:measured_LRA=${measured.input_lra}`,
      `:measured_thresh=${measured.input_thresh}`,
      `:offset=${measured.target_offset}`,
      ":linear=true",
    ].join("");
    await run("ffmpeg", [
      ...["-y", "-loglevel", "error", "-i", raw],
      ...[
        "-af",
        `${limiter},${loudnorm(known)}`,
        "-ar",
        String(MIX_RATE),
        "-c:a",
        "pcm_s16le",
        out,
      ],
    ]);
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
