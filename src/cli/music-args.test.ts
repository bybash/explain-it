import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { parseMusicArgs } from "./music-args.ts";

const errors = (argv: string[]) => {
  const result = parseMusicArgs(argv);
  return result.ok ? [] : result.errors;
};

describe("parseMusicArgs", () => {
  it("reads a mood, a length and a file, with the config's seed by default", () => {
    expect(parseMusicArgs(["upbeat", "12.5", "out.wav"])).toEqual({
      ok: true,
      value: { mood: "upbeat", seconds: 12.5, out: "out.wav", seed: DEFAULT_CONFIG.music.seed },
    });
    expect(parseMusicArgs(["calm", "20", "a.wav", "--seed", "7"])).toMatchObject({
      ok: true,
      value: { seed: 7 },
    });
    expect(parseMusicArgs(["calm", "20", "a.wav", "--seed=8"])).toMatchObject({
      value: { seed: 8 },
    });
  });

  it("names every argument that is wrong", () => {
    expect(errors([])).toEqual([
      { path: "<mood>", message: "required" },
      { path: "<seconds>", message: "required" },
      { path: "<out.wav>", message: "required" },
    ]);
    expect(errors(["loud", "-3", "out.mp3", "--seed", "x"])).toEqual([
      { path: "<mood>", message: 'must be one of "calm", "upbeat", "technical"' },
      { path: "<seconds>", message: "must be a number of seconds from 1 to 600" },
      { path: "<out.wav>", message: "must end in .wav" },
      { path: "--seed", message: "must be a whole number from 0" },
    ]);
    expect(errors(["calm", "5", "a.wav", "--loud"])).toEqual([
      { path: "--loud", message: "unknown option" },
    ]);
  });
});
