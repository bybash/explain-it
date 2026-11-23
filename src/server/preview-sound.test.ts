import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeMix } from "../audio/fake-mix.testing.ts";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import type { MissingTool } from "../render/environment.ts";
import { loadProject } from "../render/load.ts";
import type { PreviewSound } from "../schema/api.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { previewSound } from "./preview-sound.ts";

const LINES = 10;

let projectsDir: string;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-preview-sound-"));
  copyExample(projectsDir, "oauth");
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const setUp = ({
  failWith,
  mixFailsWith,
  missing = [],
}: {
  failWith?: string;
  mixFailsWith?: string;
  missing?: MissingTool[];
} = {}) => {
  const voices = fakeTts(failWith ? { failWith } : {});
  const mixer = fakeMix(mixFailsWith ? { failWith: mixFailsWith } : {});
  const events = createEvents();
  const seen: unknown[] = [];
  events.subscribe((event) => seen.push(event));
  const sound = previewSound({
    projectsDir,
    tts: voices.tts,
    mix: mixer.mix,
    missingTools: async () => missing,
    events,
  });
  /** Starts the sound and waits until it is no longer being made. */
  const settled = async (): Promise<PreviewSound> => {
    const started = await sound.start("oauth");
    if (!started?.ok) throw new Error(JSON.stringify(started));
    for (let i = 0; i < 200; i++) {
      const now = sound.status("oauth");
      if (now.state !== "speaking" && now.state !== "mixing") return now;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("the sound never settled");
  };
  return { voices, mixer, seen, sound, settled };
};

const editFile = (file: string, edit: (data: Record<string, unknown>) => unknown) => {
  const path = join(projectsDir, "oauth", file);
  writeFileSync(path, JSON.stringify(edit(JSON.parse(readFileSync(path, "utf8")))));
};
const soundtracks = () => readdirSync(join(projectsDir, "oauth", "cache", "preview"));

describe("previewSound", () => {
  it("speaks every line with progress, then mixes the soundtrack and measures the narration", async () => {
    const { voices, seen, sound, settled } = setUp();
    const ready = await settled();
    expect(ready.state).toBe("ready");
    if (ready.state !== "ready") return;
    expect(voices.asked).toHaveLength(LINES);
    expect(Object.keys(ready.narration)).toHaveLength(LINES);
    expect(existsSync(sound.file("oauth", ready.key) ?? "")).toBe(true);
    // Listeners hear each line spoken, then the mix, then the end.
    const states = seen.map((e) => (e as { state: string }).state);
    expect(states.filter((s) => s === "speaking").length).toBeGreaterThanOrEqual(LINES);
    expect(states.slice(-2)).toEqual(["mixing", "ready"]);
  });

  it("is ready at once the next time, from the files, when nothing changed", async () => {
    await setUp().settled();
    const again = setUp();
    const started = await again.sound.start("oauth");
    expect(started?.ok && started.value.state).toBe("ready");
    expect(again.voices.asked).toEqual([]);
  });

  it("is not made again for a change that does not change the sound or its timing", async () => {
    const first = await setUp().settled();
    editFile("config.json", (config) => ({
      ...config,
      theme: { palette: "ocean" },
      font: "manrope",
    }));
    const next = setUp();
    const started = await next.sound.start("oauth");
    expect(started?.ok && started.value).toEqual(first);
    expect(next.mixer.mixes).toEqual([]);
  });

  it("speaks only the line that changed, mixes again, and keeps only the newest soundtrack", async () => {
    const first = await setUp().settled();
    editFile("storyboard.json", (board) => {
      const scenes = board.scenes as { beats: { say?: string }[] }[];
      const beat = scenes[0]?.beats[0];
      if (beat) beat.say = "Someone opens the app.";
      return board;
    });
    const next = setUp();
    const ready = await next.settled();
    expect(next.voices.asked.map((a) => a.text)).toEqual(["Someone opens the app."]);
    expect(ready.state === "ready" && first.state === "ready").toBe(true);
    if (ready.state !== "ready" || first.state !== "ready") return;
    expect(ready.key).not.toBe(first.key);
    expect(soundtracks()).toEqual([`${ready.key}.wav`]);
  });

  it("never takes a soundtrack whose mix was cut short as made", async () => {
    const failed = await setUp({ mixFailsWith: "ffmpeg was stopped" }).settled();
    expect(failed).toEqual({ state: "failed", step: "mix", message: "ffmpeg was stopped" });
    const next = setUp();
    await next.settled();
    expect(next.mixer.mixes).toHaveLength(1);
  });

  it("names ffmpeg when it is missing, after speaking the lines", async () => {
    const message = "ffmpeg is not installed: install it (macOS: brew install ffmpeg)";
    const { voices, settled } = setUp({ missing: [{ tool: "ffmpeg", message }] });
    expect(await settled()).toEqual({ state: "failed", step: "mix", message });
    expect(voices.asked).toHaveLength(LINES);
  });

  it("is silent when the video has neither voice nor music", async () => {
    editFile("config.json", (config) => ({
      ...config,
      voice: { enabled: false },
      music: { enabled: false },
    }));
    const { voices, settled } = setUp();
    expect(await settled()).toEqual({ state: "silent" });
    expect(voices.asked).toEqual([]);
  });

  it("says why the voice could not be made", async () => {
    const { settled } = setUp({ failWith: "the voice model did not load: offline" });
    expect(await settled()).toEqual({
      state: "failed",
      step: "voice",
      message: "the voice model did not load: offline",
    });
  });

  it("tells when the sound is no longer being made", async () => {
    const { sound } = setUp();
    expect(await sound.settled("oauth")).toEqual({ status: { state: "idle" } });
    await sound.start("oauth");
    const { key, status } = await sound.settled("oauth");
    expect(status.state).toBe("ready");
    expect(status.state === "ready" && status.key).toBe(key);
  });

  it("gives a render its soundtrack when it was mixed for the same files, and none otherwise", async () => {
    const { sound, settled } = setUp();
    const ready = await settled();
    if (ready.state !== "ready") throw new Error("the sound was not made");
    const loaded = await loadProject(join(projectsDir, "oauth"));
    if (!loaded.ok) throw new Error("the example does not load");
    expect(await sound.soundtrackFor("oauth", loaded.value)).toBe(sound.file("oauth", ready.key));
    const [scene, ...rest] = loaded.value.storyboard.scenes;
    if (!scene) throw new Error("the example has no scene");
    const edited = {
      ...loaded.value,
      storyboard: { ...loaded.value.storyboard, scenes: [{ ...scene, title: "Another" }, ...rest] },
    };
    expect(await sound.soundtrackFor("oauth", edited)).toBeUndefined();
    expect(await sound.soundtrackFor("nope", loaded.value)).toBeUndefined();
  });

  it("names what the preview needs when the script is missing", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const started = await setUp().sound.start("oauth");
    expect(started?.ok).toBe(false);
    expect(started?.ok === false && started.errors[0]?.path).toBe("storyboard.json");
  });

  it("knows no project that does not exist", async () => {
    expect(await setUp().sound.start("nope")).toBeUndefined();
  });
});
