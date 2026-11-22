import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { generateVoice, narrationLengths } from "../audio/voice.ts";
import { checkSoundtrack } from "./check.ts";
import { loadProject, type ProjectFiles } from "./load.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("checkSoundtrack (ffmpeg)", () => {
  let dir: string;
  let project: ProjectFiles;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "explain-it-check-audio-"));
    const loaded = await loadProject(resolve("examples/oauth-login"));
    if (!loaded.ok) throw new Error("the example does not load");
    project = loaded.value;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("mixes the soundtrack a render would, measures it and finds it right", async () => {
    const lines = await generateVoice({
      projectDir: dir,
      storyboard: project.storyboard,
      voice: project.config.voice,
      tts: fakeTts().tts,
    });
    const voiced = { ...project, narration: narrationLengths(lines) };
    expect(await checkSoundtrack({ project: voiced, lines, measure: undefined })).toEqual([]);
  }, 60_000);

  it("names a mix that is not at the target", async () => {
    // A stand-in for the meter that reports a quiet, peaky mix.
    const warnings = await checkSoundtrack({
      project,
      lines: [],
      measure: async () => ({ integrated: -19.4, truePeak: -0.2 }),
    });
    expect(warnings.map((w) => w.message)).toEqual([
      "the mix is at -19.4 LUFS; it should be -16 ± 1",
      "the mix peaks at -0.2 dBTP; it should stay at or below -1",
    ]);
  }, 60_000);

  it("has nothing to measure without a voice or music", async () => {
    const silent = {
      ...project,
      config: {
        ...project.config,
        voice: { ...project.config.voice, enabled: false },
        music: { ...project.config.music, enabled: false },
      },
    };
    expect(await checkSoundtrack({ project: silent, lines: [], measure: undefined })).toEqual([]);
  });
});
