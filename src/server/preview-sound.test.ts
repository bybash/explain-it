import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import type { makeSoundtrack } from "../audio/soundtrack.ts";
import { encodeWav } from "../audio/wav.ts";
import type { PreviewSound } from "../schema/api.ts";
import { createEvents } from "./events.ts";
import { previewSound } from "./preview-sound.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const LINES = 10;

let projectsDir: string;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-preview-sound-"));
  cpSync(example, join(projectsDir, "oauth"), {
    recursive: true,
    filter: (source) => !source.includes("/out") && !source.includes("/cache"),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/** Mixes as the render does, without ffmpeg: a second of silence, or nothing with no sound at all. */
const fakeMix: typeof makeSoundtrack = async ({ project, lines, out }) => {
  if (lines.length === 0 && !project.config.music.enabled) return undefined;
  await writeFile(out, encodeWav({ samples: new Float32Array(48_000), sampleRate: 48_000 }));
  return out;
};

const setUp = ({
  failWith,
  mix = fakeMix,
}: {
  failWith?: string;
  mix?: typeof makeSoundtrack;
} = {}) => {
  const voices = fakeTts(failWith ? { failWith } : {});
  const events = createEvents();
  const seen: unknown[] = [];
  events.subscribe((event) => seen.push(event));
  const sound = previewSound({ projectsDir, tts: voices.tts, mix, events });
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
  return { voices, seen, sound, settled };
};

const editFile = (file: string, edit: (data: Record<string, unknown>) => unknown) => {
  const path = join(projectsDir, "oauth", file);
  writeFileSync(path, JSON.stringify(edit(JSON.parse(readFileSync(path, "utf8")))));
};

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

  it("speaks only the line that changed, and mixes again", async () => {
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
    expect(ready.state === "ready" && first.state === "ready" && ready.key !== first.key).toBe(
      true,
    );
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
      message: "the voice model did not load: offline",
    });
  });

  it("names what the preview needs when the script is missing", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const { sound } = setUp();
    const started = await sound.start("oauth");
    expect(started?.ok).toBe(false);
    expect(started?.ok === false && started.errors[0]?.path).toBe("storyboard.json");
  });

  it("knows no project that does not exist", async () => {
    expect(await setUp().sound.start("nope")).toBeUndefined();
  });
});
