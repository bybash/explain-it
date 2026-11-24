import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderManifest } from "../schema/render.ts";
import { renderFilePath, rendersIn } from "./renders.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-renders-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A render as it lies on disk: every theme's files, then its manifest, unless it is still running. */
const rendered = (
  stamp: string,
  {
    themes = ["light"],
    finished = true,
    audio = true,
  }: {
    themes?: ("light" | "dark")[];
    finished?: boolean;
    audio?: boolean;
  } = {},
) => {
  for (const theme of themes) {
    const folder = join(dir, "out", stamp, theme);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "video.mp4"), "x".repeat(800));
    writeFileSync(join(folder, "video-clean.mp4"), "x".repeat(700));
    writeFileSync(join(folder, "captions.srt"), "1\n");
    if (audio) writeFileSync(join(folder, "audio.wav"), "x".repeat(500));
    writeFileSync(join(folder, "poster.png"), "x".repeat(40));
    writeFileSync(join(folder, "contact-sheet.png"), "x".repeat(90));
  }
  if (!finished) return;
  const manifest: RenderManifest = {
    version: 1,
    createdAt: stamp.replace(/T(\d\d)-(\d\d)-(\d\d)/, "T$1:$2:$3"),
    resolution: "720p",
    themes,
    seconds: 65.2,
  };
  writeFileSync(join(dir, "out", stamp, "render.json"), JSON.stringify(manifest));
};

describe("rendersIn", () => {
  it("lists the finished renders, newest first, each theme's files with their sizes", async () => {
    rendered("2026-11-22T09-00-00.000Z");
    rendered("2026-11-23T10-30-00.000Z", { themes: ["light", "dark"], audio: false });
    const renders = await rendersIn(dir);
    expect(renders.map((r) => r.stamp)).toEqual([
      "2026-11-23T10-30-00.000Z",
      "2026-11-22T09-00-00.000Z",
    ]);
    const [newest] = renders;
    expect(newest).toMatchObject({
      createdAt: "2026-11-23T10:30:00.000Z",
      resolution: "720p",
      themes: ["light", "dark"],
      seconds: 65.2,
    });
    expect(newest?.files.filter((f) => f.theme === "dark")).toEqual([
      { theme: "dark", file: "video", name: "video.mp4", bytes: 800 },
      { theme: "dark", file: "clean", name: "video-clean.mp4", bytes: 700 },
      { theme: "dark", file: "captions", name: "captions.srt", bytes: 2 },
      { theme: "dark", file: "poster", name: "poster.png", bytes: 40 },
      { theme: "dark", file: "contactSheet", name: "contact-sheet.png", bytes: 90 },
    ]);
    expect(renders[1]?.files.map((f) => f.name)).toContain("audio.wav");
  });

  it("leaves out a render still running, and folders that are not renders", async () => {
    rendered("2026-11-23T10-30-00.000Z", { finished: false });
    mkdirSync(join(dir, "out", "notes"), { recursive: true });
    mkdirSync(join(dir, "out", "2026-11-23T11-00-00.000Z"), { recursive: true });
    writeFileSync(join(dir, "out", "2026-11-23T11-00-00.000Z", "render.json"), "{ not json");
    expect(await rendersIn(dir)).toEqual([]);
  });

  it("has nothing to list for a project that never rendered", async () => {
    expect(await rendersIn(dir)).toEqual([]);
  });
});

describe("renderFilePath", () => {
  it("finds a finished render's file by its folder, theme and name", async () => {
    rendered("2026-11-23T10-30-00.000Z");
    expect(await renderFilePath(dir, "2026-11-23T10-30-00.000Z", "light", "video.mp4")).toBe(
      join(dir, "out", "2026-11-23T10-30-00.000Z", "light", "video.mp4"),
    );
  });

  it("finds nothing outside a finished render's own files", async () => {
    rendered("2026-11-23T10-30-00.000Z");
    rendered("2026-11-23T11-00-00.000Z", { finished: false });
    expect(await renderFilePath(dir, "2026-11-23T11-00-00.000Z", "light", "video.mp4")).toBe(
      undefined,
    );
    expect(await renderFilePath(dir, "2026-11-23T10-30-00.000Z", "dark", "video.mp4")).toBe(
      undefined,
    );
    expect(await renderFilePath(dir, "2026-11-23T10-30-00.000Z", "light", "render.json")).toBe(
      undefined,
    );
    expect(await renderFilePath(dir, "..", "light", "video.mp4")).toBe(undefined);
    expect(await renderFilePath(dir, "2026-11-23T10-30-00.000Z", "..", "video.mp4")).toBe(
      undefined,
    );
  });
});
