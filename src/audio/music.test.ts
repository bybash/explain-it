import { describe, expect, it } from "vitest";
import { MUSIC_MOODS } from "../schema/config.ts";
import { MUSIC_RATE, MUSIC_RMS_DB, musicPlan, renderMusic } from "./music.ts";

const db = (x: number) => 20 * Math.log10(x);
const peak = (samples: Float32Array) => samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

describe("musicPlan", () => {
  it("is the same for the same mood, seed and length", () => {
    for (const mood of MUSIC_MOODS)
      expect(musicPlan({ mood, seed: 3, seconds: 30 })).toEqual(
        musicPlan({ mood, seed: 3, seconds: 30 }),
      );
  });

  it("differs between seeds and between moods", () => {
    const calm = musicPlan({ mood: "calm", seed: 1, seconds: 30 });
    expect(musicPlan({ mood: "calm", seed: 2, seconds: 30 })).not.toEqual(calm);
    expect(musicPlan({ mood: "upbeat", seed: 1, seconds: 30 })).not.toEqual(calm);
  });

  it("plays more notes a second when upbeat or technical than when calm", () => {
    const rate = (mood: (typeof MUSIC_MOODS)[number]) =>
      musicPlan({ mood, seed: 1, seconds: 60 }).notes.length / 60;
    expect(rate("upbeat")).toBeGreaterThan(2 * rate("calm"));
    expect(rate("technical")).toBeGreaterThan(rate("upbeat"));
  });

  it("keeps every note inside the music", () => {
    for (const mood of MUSIC_MOODS)
      for (const note of musicPlan({ mood, seed: 5, seconds: 20 }).notes) {
        expect(note.at).toBeGreaterThanOrEqual(-note.length);
        expect(note.at).toBeLessThan(20);
      }
  });
});

describe("renderMusic", () => {
  it("is exactly as long as asked, at 48 kHz", () => {
    const audio = renderMusic(musicPlan({ mood: "calm", seed: 1, seconds: 7.5 }));
    expect(audio.sampleRate).toBe(MUSIC_RATE);
    expect(audio.samples.length).toBe(7.5 * MUSIC_RATE);
  });

  it("gives the same samples for the same plan", () => {
    const plan = musicPlan({ mood: "technical", seed: 9, seconds: 6 });
    expect(renderMusic(plan).samples).toEqual(renderMusic(plan).samples);
  });

  it("fades in from silence and out to silence", () => {
    for (const mood of MUSIC_MOODS) {
      const { samples } = renderMusic(musicPlan({ mood, seed: 1, seconds: 12 }));
      expect(Math.abs(samples[0] ?? 1)).toBeLessThan(1e-3);
      expect(Math.abs(samples.at(-1) ?? 1)).toBeLessThan(1e-3);
    }
  });

  it("sits at one loudness whatever the mood, with peaks under -1 dBFS", () => {
    for (const mood of MUSIC_MOODS) {
      const { samples } = renderMusic(musicPlan({ mood, seed: 2, seconds: 20 }));
      expect(samples.every(Number.isFinite)).toBe(true);
      // Measured away from the fades.
      const middle = samples.subarray(5 * MUSIC_RATE, 14 * MUSIC_RATE);
      expect(db(rms(middle))).toBeGreaterThan(MUSIC_RMS_DB - 2);
      expect(db(rms(middle))).toBeLessThan(MUSIC_RMS_DB + 2);
      expect(db(peak(samples))).toBeLessThanOrEqual(-1);
    }
  });

  it("ends every note smoothly, with no click where it is cut", () => {
    // One short bell alone, so its tail is easy to see: the last sample before the cut is near silence.
    const note = { at: 1, length: 0.4, midi: 72, instrument: "bell" as const, gain: 0.5, phase: 0 };
    const { samples } = renderMusic({ seconds: 10, notes: [note] }, { master: false });
    const cut = Math.round((note.at + note.length) * MUSIC_RATE) - 1;
    const loudest = peak(samples.subarray(Math.round(note.at * MUSIC_RATE), cut));
    expect(Math.abs(samples[cut] ?? 1)).toBeLessThan(loudest * 0.01);
  });

  it("drops the pulse's pitch as it fades, as a soft kick does", () => {
    const note = {
      at: 0,
      length: 0.35,
      midi: 38,
      instrument: "pulse" as const,
      gain: 0.5,
      phase: 0,
    };
    const { samples } = renderMusic({ seconds: 1, notes: [note] }, { master: false });
    // Zero crossings a second, early and late in the note.
    const crossings = (from: number, to: number) => {
      let count = 0;
      for (let i = Math.round(from * MUSIC_RATE) + 1; i < Math.round(to * MUSIC_RATE); i++)
        if (Math.sign(samples[i] ?? 0) !== Math.sign(samples[i - 1] ?? 0)) count++;
      return count / (to - from) / 2;
    };
    expect(crossings(0.005, 0.06)).toBeGreaterThan(1.4 * crossings(0.2, 0.3));
  });

  it("keeps its loudness on short music too", () => {
    for (const seconds of [4, 8.5, 12]) {
      const { samples } = renderMusic(musicPlan({ mood: "calm", seed: 1, seconds }));
      const middle = samples.subarray(
        Math.round(samples.length * 0.4),
        Math.round(samples.length * 0.6),
      );
      expect(db(rms(middle))).toBeGreaterThan(MUSIC_RMS_DB - 3);
      expect(db(rms(middle))).toBeLessThan(MUSIC_RMS_DB + 3);
    }
  });
});
