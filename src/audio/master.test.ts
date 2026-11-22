import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { masterAudio, measureLoudness } from "./master.ts";
import { MIX_RATE, mixAudio } from "./mix.ts";
import { musicPlan, renderMusic } from "./music.ts";
import type { Audio } from "./wav.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** Speech-like test lines at Kokoro's 24 kHz: a voiced buzz in syllables, each opening with a plosive spike. */
const syllables = (seconds: number): Audio => {
  const rate = 24_000;
  return {
    samples: Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => {
      const t = i / rate;
      const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t));
      // Brief and rare, as Kokoro's are: about 25 dB over the speech, a few samples long.
      const plosive = i % (rate / 4) < 3 ? 0.5 : 0;
      return (
        0.05 *
          syllable *
          (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t)) +
        plosive
      );
    }),
    sampleRate: rate,
  };
};

describe.skipIf(!hasFfmpeg)("masterAudio (ffmpeg)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "explain-it-master-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const seconds = 20;
  const lines = [2, 7, 12].map((at) => ({ at, audio: syllables(3) }));
  const music = renderMusic(musicPlan({ mood: "upbeat", seed: 1, seconds }));
  const cases = {
    "voice and music": mixAudio({ seconds, lines, music, volumeDb: -12 }),
    "music alone": mixAudio({ seconds, lines: [], music, volumeDb: -12 }),
    "voice alone": mixAudio({ seconds, lines, volumeDb: -12 }),
  };

  for (const [name, mix] of Object.entries(cases))
    it(`brings ${name} to -16 LUFS with true peaks at or below -1 dBTP`, async () => {
      if (!mix) throw new Error("no mix");
      const out = join(dir, `${name.replaceAll(" ", "-")}.wav`);
      await masterAudio(mix, out);
      const loudness = await measureLoudness(out);
      expect(loudness.integrated).toBeGreaterThanOrEqual(-17);
      expect(loudness.integrated).toBeLessThanOrEqual(-15);
      expect(loudness.truePeak).toBeLessThanOrEqual(-1);
      expect(loudness.seconds).toBeCloseTo(seconds, 1);
      expect(loudness.sampleRate).toBe(MIX_RATE);
    }, 60_000);
});
