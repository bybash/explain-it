import { describe, expect, it } from "vitest";
import {
  DUCK_DB,
  duckedMusic,
  MIX_RATE,
  mixAudio,
  resample,
  speakingEnvelope,
  VOICE_RMS_DB,
  voiceTrack,
} from "./mix.ts";
import type { Audio } from "./wav.ts";

const db = (x: number) => 20 * Math.log10(x);
const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / Math.max(1, samples.length));
const at = (seconds: number) => Math.round(seconds * MIX_RATE);
const tone = (seconds: number, rate: number, hz = 220, level = 0.3): Audio => ({
  samples: Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => level * Math.sin((2 * Math.PI * hz * i) / rate),
  ),
  sampleRate: rate,
});
const crossings = (samples: Float32Array) => {
  let count = 0;
  for (let i = 1; i < samples.length; i++)
    if (Math.sign(samples[i] ?? 0) !== Math.sign(samples[i - 1] ?? 0)) count++;
  return count;
};

describe("resample", () => {
  it("brings a 24 kHz line to 48 kHz without changing its pitch or length", () => {
    const line = tone(1, 24_000, 220);
    const up = resample(line, MIX_RATE);
    expect(up.length).toBe(MIX_RATE);
    // 220 Hz crosses zero 440 times a second at any rate.
    expect(Math.abs(crossings(up) - 440)).toBeLessThanOrEqual(2);
  });
});

describe("voiceTrack", () => {
  it("places each line at its time, levelled to the voice's loudness", () => {
    const track = voiceTrack(
      [
        { at: 1, audio: tone(0.5, 24_000, 220, 0.05) },
        { at: 3, audio: tone(0.5, 24_000, 330, 0.5) },
      ],
      5,
    );
    expect(track.length).toBe(at(5));
    expect(rms(track.subarray(0, at(0.99)))).toBe(0);
    expect(rms(track.subarray(at(1.01), at(1.49)))).toBeGreaterThan(0);
    expect(rms(track.subarray(at(1.6), at(2.9)))).toBe(0);
    // Measured over where it speaks, the whole voice sits at one loudness.
    const spoken = Float32Array.from([
      ...track.subarray(at(1), at(1.5)),
      ...track.subarray(at(3), at(3.5)),
    ]);
    expect(db(rms(spoken))).toBeCloseTo(VOICE_RMS_DB, 0);
  });

  it("cuts a line that would run past the end", () => {
    expect(voiceTrack([{ at: 1.8, audio: tone(1, 24_000) }], 2).length).toBe(at(2));
  });
});

describe("speakingEnvelope", () => {
  it("is 1 while the voice speaks, 0 well away from it, and eases between", () => {
    const voice = voiceTrack([{ at: 2, audio: tone(2, 24_000) }], 6);
    const envelope = speakingEnvelope(voice);
    expect(envelope[at(1)]).toBe(0);
    expect(envelope[at(3)]).toBe(1);
    expect(envelope[at(5.5)]).toBe(0);
    // The dip starts just before the line: 0.15 s before it, it is on its way.
    const easing = envelope[at(1.85)] ?? 0;
    expect(easing).toBeGreaterThan(0);
    expect(easing).toBeLessThan(1);
  });
});

describe("duckedMusic", () => {
  const music = tone(6, MIX_RATE, 110, 0.1);
  const voice = voiceTrack([{ at: 2, audio: tone(2, 24_000) }], 6);
  const level = (samples: Float32Array, from: number, to: number) =>
    db(rms(samples.subarray(at(from), at(to))));

  it("sits volumeDb under the voice while nobody speaks, and dips further while it does", () => {
    const ducked = duckedMusic(music, speakingEnvelope(voice), -12);
    expect(level(ducked, 0.2, 1.2)).toBeCloseTo(VOICE_RMS_DB - 12, 0);
    expect(level(ducked, 2.6, 3.4)).toBeCloseTo(VOICE_RMS_DB - 12 + DUCK_DB, 0);
  });
});

describe("mixAudio", () => {
  const lines = [{ at: 1, audio: tone(1, 24_000) }];
  const music = tone(4, MIX_RATE, 110, 0.1);

  it("mixes the voice and the ducked music", () => {
    const mix = mixAudio({ seconds: 4, lines, music, volumeDb: -12 });
    expect(mix?.sampleRate).toBe(MIX_RATE);
    expect(mix?.samples.length).toBe(at(4));
    expect(rms(mix?.samples.subarray(at(1.2), at(1.8)) ?? new Float32Array())).toBeGreaterThan(
      rms(mix?.samples.subarray(at(2.8), at(3.6)) ?? new Float32Array()),
    );
  });

  it("is the voice alone, the music alone, or nothing", () => {
    expect(mixAudio({ seconds: 4, lines, volumeDb: -12 })?.samples.length).toBe(at(4));
    expect(mixAudio({ seconds: 4, lines: [], music, volumeDb: -12 })?.samples.length).toBe(at(4));
    expect(mixAudio({ seconds: 4, lines: [], volumeDb: -12 })).toBeUndefined();
  });
});
