import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { LEAD_IN } from "../engine/beats/timing.ts";
import { loadProject, type ProjectFiles } from "../render/load.ts";
import { fakeTts } from "./fake-tts.testing.ts";
import { measureLoudness } from "./master.ts";
import { linePlacements, makeSoundtrack } from "./soundtrack.ts";
import { generateVoice, narrationLengths } from "./voice.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

let dir: string;
let project: ProjectFiles;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-soundtrack-"));
  const loaded = await loadProject(resolve("examples/oauth-login"));
  if (!loaded.ok) throw new Error("the example does not load");
  project = loaded.value;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const voiced = async (config = project.config) => {
  const lines = await generateVoice({
    projectDir: dir,
    storyboard: project.storyboard,
    voice: config.voice,
    tts: fakeTts().tts,
  });
  return { ...project, config, narration: narrationLengths(lines), lines };
};

describe("linePlacements", () => {
  it("starts each line at its beat's narration, as the video times it", async () => {
    const { lines, ...files } = await voiced();
    const plan = buildBeats(
      files.storyboard,
      files.graph,
      beatOptions(files.config, files.narration),
    );
    const placed = linePlacements(files, lines);
    expect(placed.map((p) => p.file)).toEqual(lines.map((l) => l.file));
    for (const [i, line] of lines.entries()) {
      const beat = plan.beats.find((b) => b.id === line.beat);
      expect(placed[i]?.at).toBeCloseTo((beat?.start ?? Number.NaN) + LEAD_IN);
    }
  });
});

describe.skipIf(!hasFfmpeg)("makeSoundtrack (ffmpeg)", () => {
  it("writes the voice and music, mastered, as long as the video", async () => {
    const { lines, ...files } = await voiced();
    const out = join(dir, "audio.wav");
    expect(await makeSoundtrack({ project: files, lines, out })).toBe(out);
    const plan = buildBeats(
      files.storyboard,
      files.graph,
      beatOptions(files.config, files.narration),
    );
    const loudness = await measureLoudness(out);
    expect(loudness.seconds).toBeCloseTo(plan.duration, 1);
    expect(loudness.integrated).toBeGreaterThanOrEqual(-17);
    expect(loudness.integrated).toBeLessThanOrEqual(-15);
  }, 60_000);

  it("writes nothing when there is neither voice nor music", async () => {
    const config = {
      ...project.config,
      voice: { ...project.config.voice, enabled: false },
      music: { ...project.config.music, enabled: false },
    };
    const out = join(dir, "silent.wav");
    expect(
      await makeSoundtrack({ project: { ...project, config }, lines: [], out }),
    ).toBeUndefined();
    expect(existsSync(out)).toBe(false);
  });
});
