import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { decodeWav } from "../audio/wav.ts";
import { MUSIC_SAMPLE_SECONDS, SAMPLE_LINE } from "../schema/api.ts";
import { createApp } from "./app.ts";
import { settingsStore } from "./settings.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const FIRST_LINE = "A user opens the app and clicks Sign in.";

let projectsDir: string;
let voices: ReturnType<typeof fakeTts>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-samples-"));
  cpSync(example, join(projectsDir, "oauth"), {
    recursive: true,
    filter: (source) => !source.includes("/out") && !source.includes("/cache"),
  });
  voices = fakeTts();
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    tts: voices.tts,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/** The level of every sample, silence included, so turning it down scales it exactly. */
const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

const wav = async (response: Response) => {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("audio/wav");
  const decoded = decodeWav(new Uint8Array(await response.arrayBuffer()));
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  return decoded.value;
};

describe("GET /api/projects/:slug/samples/voice", () => {
  it("speaks the script's first line in the voice and speed asked, once", async () => {
    const url = "/api/projects/oauth/samples/voice?voice=bm_george&speed=1.2";
    await wav(await app.request(url));
    await wav(await app.request(url));
    expect(voices.asked).toEqual([{ text: FIRST_LINE, voice: "bm_george", speed: 1.2 }]);
  });

  it("speaks a sentence of its own for a project with no narration yet", async () => {
    await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Photo upload" }),
    });
    await wav(await app.request("/api/projects/photo-upload/samples/voice?voice=af_heart&speed=1"));
    expect(voices.asked.map((a) => a.text)).toEqual([SAMPLE_LINE]);
  });

  it("names a voice or speed that is not one", async () => {
    const response = await app.request("/api/projects/oauth/samples/voice?voice=hal&speed=9");
    expect(response.status).toBe(400);
    const paths = (await response.json()).errors.map((e: { path: string }) => e.path).sort();
    expect(paths).toEqual(["speed", "voice"]);
    expect(voices.asked).toEqual([]);
  });

  it("answers 404 for a project that does not exist", async () => {
    const response = await app.request("/api/projects/nope/samples/voice?voice=af_heart&speed=1");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/samples/music", () => {
  const sample = (query: string) => app.request(`/api/samples/music?${query}`);

  it("plays a few seconds of the mood and take, at the volume asked", async () => {
    const loud = await wav(await sample("mood=upbeat&seed=3&volumeDb=-12"));
    expect(loud.seconds).toBeCloseTo(MUSIC_SAMPLE_SECONDS, 1);
    const quiet = await wav(await sample("mood=upbeat&seed=3&volumeDb=-24"));
    expect(rms(quiet.samples) / rms(loud.samples)).toBeCloseTo(10 ** (-12 / 20), 2);
  });

  it("turns up only as far as full scale, so it never clips", async () => {
    const loudest = await wav(await sample("mood=upbeat&seed=3&volumeDb=0"));
    // Clipped music sits flat at full scale for many samples; music brought up to it touches it once.
    const atFullScale = loudest.samples.filter((s) => Math.abs(s) > 0.999).length;
    expect(atFullScale).toBeLessThanOrEqual(2);
  });

  it("names a mood, take or volume that is not one", async () => {
    const response = await sample("mood=sad&seed=-1&volumeDb=3");
    expect(response.status).toBe(400);
    const paths = (await response.json()).errors.map((e: { path: string }) => e.path).sort();
    expect(paths).toEqual(["mood", "seed", "volumeDb"]);
  });
});
