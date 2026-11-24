import { describe, expect, it } from "vitest";
import type { RendersView } from "../schema/api.ts";
import type { RenderJob } from "../schema/render.ts";
import { jobLine, jobsToShow, sizeLabel, themesOf } from "./render-rows.ts";

const job = (over: Partial<RenderJob>): RenderJob => ({
  id: "job-1",
  slug: "oauth",
  state: "running",
  request: { slug: "oauth" },
  createdAt: "2026-11-23T10:30:00.000Z",
  ...over,
});

describe("jobLine", () => {
  it("says what a render is doing, step by step", () => {
    expect(jobLine(job({ state: "queued" }))).toBe("Waiting for the render before it…");
    expect(jobLine(job({}))).toBe("Starting…");
    expect(jobLine(job({ step: { step: "voice", spoken: 3, total: 10 } }))).toBe(
      "Speaking line 4 of 10…",
    );
    expect(jobLine(job({ step: { step: "mix" } }))).toBe("Mixing the voice and the music…");
    expect(
      jobLine(
        job({
          step: { step: "frames" },
          progress: {
            theme: "dark",
            done: 812,
            total: 1950,
            themeIndex: 1,
            themes: 2,
            percent: 70,
          },
        }),
      ),
    ).toBe("Capturing the dark video: frame 812 of 1950");
    expect(jobLine(job({ step: { step: "frames" } }))).toBe("Opening the video in Chrome…");
    expect(jobLine(job({ step: { step: "finishing" } }))).toBe(
      "Writing the poster, the captions and the contact sheet…",
    );
  });

  it("says how a render ended when it did not finish", () => {
    expect(jobLine(job({ state: "failed", error: "ffmpeg is not installed" }))).toBe(
      "The render failed: ffmpeg is not installed",
    );
    expect(jobLine(job({ state: "cancelled" }))).toBe("Cancelled.");
  });
});

describe("jobsToShow", () => {
  const render = (stamp: string): RendersView["renders"][number] => ({
    stamp,
    createdAt: "2026-11-23T10:30:00.000Z",
    resolution: "720p",
    themes: ["light"],
    seconds: 65,
    files: [],
  });

  it("leaves out a finished job, as its render is listed, and keeps the others", () => {
    const view: RendersView = {
      jobs: [
        job({ id: "a", state: "queued" }),
        job({ id: "b", state: "running", stamp: "2026-11-23T10-40-00.000Z" }),
        job({ id: "c", state: "done", stamp: "2026-11-23T10-30-00.000Z" }),
        job({ id: "d", state: "failed", error: "Chrome crashed" }),
      ],
      renders: [render("2026-11-23T10-30-00.000Z")],
    };
    expect(jobsToShow(view).map((j) => j.id)).toEqual(["a", "b", "d"]);
  });
});

describe("themesOf", () => {
  it("groups a render's files by theme, in the order it rendered them", () => {
    const grouped = themesOf({
      stamp: "2026-11-23T10-30-00.000Z",
      createdAt: "2026-11-23T10:30:00.000Z",
      resolution: "1080p",
      themes: ["light", "dark"],
      seconds: 65,
      files: [
        { theme: "light", file: "video", name: "video.mp4", bytes: 8_100_000 },
        { theme: "light", file: "poster", name: "poster.png", bytes: 56_000 },
        { theme: "dark", file: "video", name: "video.mp4", bytes: 8_000_000 },
      ],
    });
    expect(grouped.map((t) => [t.theme, t.files.map((f) => f.file)])).toEqual([
      ["light", ["video", "poster"]],
      ["dark", ["video"]],
    ]);
  });
});

describe("sizeLabel", () => {
  it("says a file's size as people read it", () => {
    expect(sizeLabel(1052)).toBe("1 KB");
    expect(sizeLabel(56_844)).toBe("57 KB");
    expect(sizeLabel(4_782_783)).toBe("4.8 MB");
    expect(sizeLabel(640)).toBe("640 bytes");
  });
});
