import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { KokoroTTS } from "kokoro-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { VOICE_IDS } from "../schema/voices.ts";
import { kokoroModelFile, kokoroProvider } from "./kokoro.ts";
import type { TtsProvider } from "./tts.ts";
import { generateVoice } from "./voice.ts";
import { decodeWav } from "./wav.ts";

describe("the Kokoro voices", () => {
  it("are the ones the schema lists", () => {
    // The voice table needs no model, so this runs everywhere.
    const voices = new KokoroTTS(null as never, null as never).voices;
    expect(Object.keys(voices).sort()).toEqual([...VOICE_IDS].sort());
  });
});

// A real line needs the model (about 92 MB). It runs where the model is
// already in the cache, and is skipped elsewhere, CI included.
const cacheDir = resolve(process.env.CACHE_DIR ?? "cache");
const hasModel = existsSync(kokoroModelFile(cacheDir));

describe.skipIf(!hasModel)("a real narration line with Kokoro", () => {
  let projectDir: string;
  beforeAll(() => {
    projectDir = mkdtempSync(join(tmpdir(), "explain-it-kokoro-"));
  });
  afterAll(() => rmSync(projectDir, { recursive: true, force: true }));

  const storyboard: Storyboard = {
    version: 1,
    scenes: [
      {
        id: "intro",
        title: "Intro",
        nodes: [],
        beats: [
          {
            id: "hello",
            caption: "Hello.",
            say: "The tool checks the project, then queues a job.",
            actions: [],
          },
        ],
      },
    ],
  };

  it("is generated once, then read from the cache", async () => {
    const kokoro = kokoroProvider({ cacheDir });
    let calls = 0;
    const counted: TtsProvider = {
      id: kokoro.id,
      generate: (text, options) => {
        calls++;
        return kokoro.generate(text, options);
      },
    };
    const voice = DEFAULT_CONFIG.voice;
    const [first] = await generateVoice({ projectDir, storyboard, voice, tts: counted });
    expect(calls).toBe(1);
    expect(first?.cached).toBe(false);
    // About three seconds of speech for nine words.
    expect(first?.seconds).toBeGreaterThan(1.5);
    expect(first?.seconds).toBeLessThan(6);
    const wav = decodeWav(await readFile(first?.file ?? ""));
    if (!wav.ok) throw new Error("not a WAV");
    expect(wav.value.sampleRate).toBe(24_000);
    const rms = Math.sqrt(
      wav.value.samples.reduce((sum, s) => sum + s * s, 0) / wav.value.samples.length,
    );
    expect(rms).toBeGreaterThan(0.01);

    const [second] = await generateVoice({ projectDir, storyboard, voice, tts: counted });
    expect(calls).toBe(1);
    expect(second).toEqual({ ...first, cached: true });
  }, 120_000);
});
