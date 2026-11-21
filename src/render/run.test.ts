import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { withNarration } from "./run.ts";

const example = async (): Promise<ProjectFiles> => {
  const loaded = await loadProject(resolve("examples/oauth-login"));
  if (!loaded.ok) throw new Error("the example does not load");
  return loaded.value;
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-run-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("withNarration", () => {
  it("speaks every line and gives the project its measured lengths", async () => {
    const project = await example();
    const said = project.storyboard.scenes.flatMap((s) => s.beats).filter((b) => b.say);
    const { tts, asked } = fakeTts();
    const voiced = await withNarration(dir, project, tts);
    expect(asked).toHaveLength(said.length);
    expect(Object.keys(voiced.project.narration ?? {})).toEqual(said.map((b) => b.id));
    // The fake speaks a tenth of a second a word.
    const first = said[0];
    expect(voiced.project.narration?.[first?.id ?? ""]).toBeCloseTo(
      (first?.say ?? "").split(/\s+/).length / 10,
    );
  });

  it("leaves a project without a voice as it is, and never asks for one", async () => {
    const project = await example();
    const silent = {
      ...project,
      config: { ...project.config, voice: { ...project.config.voice, enabled: false } },
    };
    const { tts, asked } = fakeTts();
    const voiced = await withNarration(dir, silent, tts);
    expect(voiced.project).toBe(silent);
    expect(asked).toEqual([]);
  });

  it("says what failed and how to render without the voice", async () => {
    const project = await example();
    const { tts } = fakeTts({ failWith: "the voice model did not load" });
    await expect(withNarration(dir, project, tts)).rejects.toThrow(
      "the voice did not generate: the voice model did not load. Turn the voice off (voice.enabled: false) to render without it",
    );
  });

  it("stops when the render is cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const { tts, asked } = fakeTts();
    await expect(withNarration(dir, await example(), tts, controller.signal)).rejects.toThrow(
      "cancelled",
    );
    expect(asked).toEqual([]);
  });
});
