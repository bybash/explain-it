import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import type { makeSoundtrack } from "../audio/soundtrack.ts";
import { encodeWav } from "../audio/wav.ts";
import { createApp } from "./app.ts";
import { settingsStore } from "./settings.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;

const fakeMix: typeof makeSoundtrack = async ({ out }) => {
  await writeFile(out, encodeWav({ samples: new Float32Array(48_000), sampleRate: 48_000 }));
  return out;
};

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-preview-routes-"));
  cpSync(example, join(projectsDir, "oauth"), {
    recursive: true,
    filter: (source) => !source.includes("/out") && !source.includes("/cache"),
  });
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    tts: fakeTts().tts,
    mixSoundtrack: fakeMix,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/** Asks for the sound as the page does: a POST with a JSON body, as the API takes every POST. */
const start = (slug: string) =>
  app.request(`/api/projects/${slug}/preview-sound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

const status = async () =>
  (await app.request("/api/projects/oauth/preview-sound")).json() as Promise<{
    state: string;
    key?: string;
    narration?: Record<string, number>;
  }>;

describe("the preview's sound", () => {
  it("starts on a POST, reports its progress, and serves the soundtrack once ready", async () => {
    expect(await status()).toEqual({ state: "idle" });
    const started = await start("oauth");
    expect(started.status).toBe(200);
    expect(["speaking", "mixing", "ready"]).toContain((await started.json()).state);

    let now = await status();
    for (let i = 0; i < 200 && now.state !== "ready"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      now = await status();
    }
    expect(now.state).toBe("ready");
    expect(Object.keys(now.narration ?? {})).toHaveLength(10);

    const sound = await app.request(`/api/projects/oauth/preview-sound/${now.key}.wav`);
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toBe("audio/wav");
  });

  it("serves no soundtrack for a key that is not the ready one", async () => {
    const response = await app.request("/api/projects/oauth/preview-sound/0123abcd.wav");
    expect(response.status).toBe(404);
  });

  it("names what the preview needs", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const response = await start("oauth");
    expect(response.status).toBe(422);
    expect((await response.json()).errors[0].path).toBe("storyboard.json");
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await start("nope")).status).toBe(404);
    expect((await app.request("/api/projects/nope/preview-sound")).status).toBe(404);
  });
});
