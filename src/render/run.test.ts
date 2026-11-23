import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeMix } from "../audio/fake-mix.testing.ts";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import type { RenderedTheme, RenderProgress, RenderStep } from "../schema/render.ts";
import { copyExample } from "../server/example.testing.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { rendersIn } from "./renders.ts";
import { type RenderPages, renderFromFolder, renderProjectFolder, withNarration } from "./run.ts";

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

/**
 * A stand-in for Chrome and ffmpeg: it writes each theme's video and tells
 * the frames' progress, remembering the soundtrack it was given and whether
 * the render's manifest was there before it finished.
 */
const fakePages = ({ failWith }: { failWith?: string } = {}) => {
  const seen: { audio?: string; audioBytes?: string; manifestEarly: boolean }[] = [];
  const renderPages: RenderPages = async ({ settings, outDir, audio, onProgress, onStep }) => {
    seen.push({
      ...(audio ? { audio, audioBytes: readFileSync(audio, "latin1") } : {}),
      manifestEarly: existsSync(join(outDir, "render.json")),
    });
    if (failWith) throw new Error(failWith);
    return settings.themes.map((theme, themeIndex): RenderedTheme => {
      onStep?.({ step: "frames" });
      onProgress?.({ theme, done: 10, total: 10, themeIndex, themes: settings.themes.length });
      const folder = join(outDir, theme);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "video.mp4"), "mp4");
      return {
        theme,
        video: join(folder, "video.mp4"),
        clean: join(folder, "video-clean.mp4"),
        captions: join(folder, "captions.srt"),
        poster: join(folder, "poster.png"),
        contactSheet: join(folder, "contact-sheet.png"),
      };
    });
  };
  return { renderPages, seen };
};

const NOW = new Date("2026-11-23T10:30:00.000Z");

describe("renderProjectFolder", () => {
  it("mixes the soundtrack, renders every theme, then writes the manifest that lists it", async () => {
    const project = await example();
    const { mix, mixes } = fakeMix();
    const pages = fakePages();
    const steps: RenderStep[] = [];
    await renderProjectFolder({
      dir,
      project,
      settings: { themes: ["light", "dark"], resolution: "720p" },
      now: NOW,
      mix,
      renderPages: pages.renderPages,
      onStep: (step) => steps.push(step),
    });
    expect(mixes).toHaveLength(1);
    expect(pages.seen[0]?.audio).toBeDefined();
    expect(pages.seen[0]?.manifestEarly).toBe(false);
    expect(steps.map((s) => s.step)).toEqual(["mix", "frames", "frames"]);
    const [listed] = await rendersIn(dir);
    expect(listed).toMatchObject({
      stamp: "2026-11-23T10-30-00.000Z",
      createdAt: NOW.toISOString(),
      resolution: "720p",
      themes: ["light", "dark"],
      seconds: buildBeats(project.storyboard, project.graph, beatOptions(project.config)).duration,
    });
  });

  it("takes the preview's soundtrack when it is the same mix, and mixes nothing", async () => {
    const premixed = join(dir, "preview.wav");
    writeFileSync(premixed, "the preview's mix");
    const { mix, mixes } = fakeMix();
    const pages = fakePages();
    const steps: RenderStep[] = [];
    await renderProjectFolder({
      dir,
      project: await example(),
      settings: { themes: ["light"], resolution: "720p" },
      now: NOW,
      premixed,
      mix,
      renderPages: pages.renderPages,
      onStep: (step) => steps.push(step),
    });
    expect(mixes).toEqual([]);
    expect(pages.seen[0]?.audioBytes).toBe("the preview's mix");
    expect(steps.map((s) => s.step)).toEqual(["frames"]);
  });

  it("leaves nothing behind when the render fails", async () => {
    const pages = fakePages({ failWith: "Chrome crashed" });
    await expect(
      renderProjectFolder({
        dir,
        project: await example(),
        settings: { themes: ["light"], resolution: "720p" },
        now: NOW,
        mix: fakeMix().mix,
        renderPages: pages.renderPages,
      }),
    ).rejects.toThrow("Chrome crashed");
    expect(existsSync(join(dir, "out", "2026-11-23T10-30-00.000Z"))).toBe(false);
    expect(await rendersIn(dir)).toEqual([]);
  });
});

describe("renderFromFolder", () => {
  it("tells each step: every line spoken, then the mix, then the frames", async () => {
    const projectsDir = mkdtempSync(join(tmpdir(), "explain-it-run-folder-"));
    try {
      copyExample(projectsDir, "oauth");
      const steps: RenderStep[] = [];
      const progress: RenderProgress[] = [];
      const run = renderFromFolder(projectsDir, () => NOW, fakeTts().tts, {
        mix: fakeMix().mix,
        renderPages: fakePages().renderPages,
      });
      await run(
        { slug: "oauth", theme: "light", resolution: "720p" },
        {
          signal: new AbortController().signal,
          onProgress: (p) => progress.push(p),
          onStep: (s) => steps.push(s),
        },
      );
      const spoken = steps.filter((s) => s.step === "voice");
      expect(spoken.at(-1)).toEqual({ step: "voice", spoken: 10, total: 10 });
      expect(steps.map((s) => s.step).filter((s) => s !== "voice")).toEqual(["mix", "frames"]);
      expect(progress).toHaveLength(1);
    } finally {
      rmSync(projectsDir, { recursive: true, force: true });
    }
  });

  it("asks for the preview's soundtrack of the files it renders, and uses it", async () => {
    const projectsDir = mkdtempSync(join(tmpdir(), "explain-it-run-folder-"));
    try {
      copyExample(projectsDir, "oauth");
      const premixed = join(projectsDir, "preview.wav");
      writeFileSync(premixed, "the preview's mix");
      const asked: string[] = [];
      const { mix, mixes } = fakeMix();
      const pages = fakePages();
      const run = renderFromFolder(projectsDir, () => NOW, fakeTts().tts, {
        mix,
        renderPages: pages.renderPages,
        soundtrackFor: async (slug, project) => {
          asked.push(`${slug}:${project.storyboard.scenes.length}`);
          return premixed;
        },
      });
      await run(
        { slug: "oauth" },
        { signal: new AbortController().signal, onProgress: () => {}, onStep: () => {} },
      );
      expect(asked).toEqual(["oauth:2"]);
      expect(mixes).toEqual([]);
      expect(pages.seen[0]?.audioBytes).toBe("the preview's mix");
    } finally {
      rmSync(projectsDir, { recursive: true, force: true });
    }
  });
});
