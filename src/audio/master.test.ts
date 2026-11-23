import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOUDNESS } from "../schema/checks.ts";
import { AUDIO_RATE } from "./level.ts";
import { masterAudio, measureLoudness } from "./master.ts";
import { mixAudio } from "./mix.ts";
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
      expect(Math.abs(loudness.integrated - LOUDNESS.target)).toBeLessThanOrEqual(
        LOUDNESS.tolerance,
      );
      expect(loudness.truePeak).toBeLessThanOrEqual(LOUDNESS.maxTruePeak);
      expect(loudness.seconds).toBeCloseTo(seconds, 1);
      expect(loudness.sampleRate).toBe(AUDIO_RATE);
    }, 60_000);

  it("masters music alone at any volume the config allows", async () => {
    for (const volumeDb of [-24, -60]) {
      const mix = mixAudio({
        seconds: 10,
        lines: [],
        music: renderMusic(musicPlan({ mood: "calm", seed: 1, seconds: 10 })),
        volumeDb,
      });
      if (!mix) throw new Error("no mix");
      const out = join(dir, `music-${-volumeDb}.wav`);
      await masterAudio(mix, out);
      expect((await measureLoudness(out)).integrated).toBeCloseTo(LOUDNESS.target, 0);
    }
  }, 60_000);

  it("stops when the render is cancelled", async () => {
    const mix = mixAudio({ seconds: 5, lines, volumeDb: -12 });
    if (!mix) throw new Error("no mix");
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(masterAudio(mix, join(dir, "cancelled.wav"), controller.signal)).rejects.toThrow();
    // Mixing the five seconds is the slow part: beside the suite's browsers it can pass five seconds.
  }, 60_000);
});
