import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { fakeTts } from "./fake-tts.testing.ts";
import { generateVoice, narrationLengths } from "./voice.ts";

const storyboard = (lines: readonly (string | undefined)[]): Storyboard => ({
  version: 1,
  scenes: [
    {
      id: "intro",
      title: "Intro",
      nodes: [],
      beats: lines.map((say, i) => ({
        id: `beat_${i + 1}`,
        caption: `Step ${i + 1}.`,
        actions: [],
        ...(say ? { say } : {}),
      })),
    },
  ],
});

let projectDir: string;
beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "explain-it-voice-"));
});
afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

const voice = DEFAULT_CONFIG.voice;
const ttsDir = () => join(projectDir, "cache", "tts");

describe("generateVoice", () => {
  it("generates each narration line into the project's cache, with its length", async () => {
    const { tts, asked } = fakeTts();
    const lines = await generateVoice({
      projectDir,
      storyboard: storyboard(["Hello there.", undefined, "One two three four."]),
      voice,
      tts,
    });
    expect(asked).toEqual([
      { text: "Hello there.", voice: "af_heart", speed: 1 },
      { text: "One two three four.", voice: "af_heart", speed: 1 },
    ]);
    expect(
      lines.map(({ scene, beat, seconds, cached }) => ({ scene, beat, seconds, cached })),
    ).toEqual([
      { scene: "intro", beat: "beat_1", seconds: 0.2, cached: false },
      { scene: "intro", beat: "beat_3", seconds: 0.4, cached: false },
    ]);
    for (const line of lines) {
      expect(line.file.startsWith(ttsDir())).toBe(true);
      expect(existsSync(line.file)).toBe(true);
    }
  });

  it("reads a line from the cache the second time, without asking the provider", async () => {
    const first = fakeTts();
    const board = storyboard(["Hello there.", "One two three four."]);
    const before = await generateVoice({ projectDir, storyboard: board, voice, tts: first.tts });
    const again = fakeTts();
    const after = await generateVoice({ projectDir, storyboard: board, voice, tts: again.tts });
    expect(again.asked).toEqual([]);
    expect(after).toEqual(before.map((line) => ({ ...line, cached: true })));
  });

  it("regenerates only the line that changed", async () => {
    await generateVoice({
      projectDir,
      storyboard: storyboard(["One.", "Two."]),
      voice,
      tts: fakeTts().tts,
    });
    const { tts, asked } = fakeTts();
    const lines = await generateVoice({
      projectDir,
      storyboard: storyboard(["One.", "Two, edited."]),
      voice,
      tts,
    });
    expect(asked.map((a) => a.text)).toEqual(["Two, edited."]);
    expect(lines.map((l) => l.cached)).toEqual([true, false]);
  });

  it("keys each line by its text, voice, speed and model", async () => {
    const board = storyboard(["Hello there."]);
    const file = async (options: { voiceId?: "bm_george"; speed?: number; model?: string }) => {
      const [line] = await generateVoice({
        projectDir,
        storyboard: board,
        voice: { ...voice, id: options.voiceId ?? voice.id, speed: options.speed ?? voice.speed },
        tts: fakeTts(options.model ? { id: options.model } : {}).tts,
      });
      return line?.file;
    };
    const files = [
      await file({}),
      await file({ voiceId: "bm_george" }),
      await file({ speed: 1.2 }),
      await file({ model: "fake-2" }),
    ];
    expect(new Set(files).size).toBe(4);
    expect(readdirSync(ttsDir())).toHaveLength(4);
  });

  it("makes nothing when the voice is off", async () => {
    const { tts, asked } = fakeTts();
    const lines = await generateVoice({
      projectDir,
      storyboard: storyboard(["Hello there."]),
      voice: { ...voice, enabled: false },
      tts,
    });
    expect(lines).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("generates again over a cached file it cannot read", async () => {
    const board = storyboard(["Hello there."]);
    const [line] = await generateVoice({
      projectDir,
      storyboard: board,
      voice,
      tts: fakeTts().tts,
    });
    writeFileSync(line?.file ?? "", "not audio");
    const { tts, asked } = fakeTts();
    const [again] = await generateVoice({ projectDir, storyboard: board, voice, tts });
    expect(asked).toHaveLength(1);
    expect(again).toMatchObject({ cached: false, seconds: 0.2 });
  });

  it("survives two runs at once on the same project", async () => {
    const board = storyboard(["Hello there.", "One two three four."]);
    const [a, b] = await Promise.all([
      generateVoice({ projectDir, storyboard: board, voice, tts: fakeTts().tts }),
      generateVoice({ projectDir, storyboard: board, voice, tts: fakeTts().tts }),
    ]);
    expect(a?.map((l) => l.file)).toEqual(b?.map((l) => l.file));
    expect(readdirSync(ttsDir()).sort()).toEqual(a?.map((l) => l.file.split("/").at(-1)).sort());
  });

  it("reads only what is cached when asked, generating nothing", async () => {
    const board = storyboard(["Hello there.", "One two three four."]);
    await generateVoice({
      projectDir,
      storyboard: storyboard(["Hello there."]),
      voice,
      tts: fakeTts().tts,
    });
    const { tts, asked } = fakeTts();
    const lines = await generateVoice({
      projectDir,
      storyboard: board,
      voice,
      tts,
      onlyCached: true,
    });
    expect(asked).toEqual([]);
    expect(lines.map((l) => ({ beat: l.beat, cached: l.cached }))).toEqual([
      { beat: "beat_1", cached: true },
    ]);
  });
});

describe("narrationLengths", () => {
  it("gives each spoken beat its measured length", async () => {
    const lines = await generateVoice({
      projectDir,
      storyboard: storyboard(["Hello there.", undefined, "One two three four."]),
      voice,
      tts: fakeTts().tts,
    });
    expect(narrationLengths(lines)).toEqual({ beat_1: 0.2, beat_3: 0.4 });
  });
});
