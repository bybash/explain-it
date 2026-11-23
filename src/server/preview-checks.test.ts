import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeMix } from "../audio/fake-mix.testing.ts";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import type { CheckRun } from "../render/check.ts";
import { checkedFilesKey } from "../render/check-files.ts";
import type { MissingTool } from "../render/environment.ts";
import type { ChecksRun } from "../schema/api.ts";
import type { CheckReport } from "../schema/checks.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { previewChecks } from "./preview-checks.ts";
import { previewSound } from "./preview-sound.ts";

const BEATS = 10;

let projectsDir: string;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-preview-checks-"));
  copyExample(projectsDir, "oauth");
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/**
 * A stand-in for the checks: it tells progress beat by beat, writes a report
 * with one warning, and, when asked, holds until it is stopped.
 */
const fakeChecks = ({ holds = false, failWith }: { holds?: boolean; failWith?: string } = {}) => {
  const runs: CheckRun[] = [];
  let running = 0;
  let mostAtOnce = 0;
  const run = async (asked: CheckRun): Promise<CheckReport> => {
    const { dir, project, skip = [], signal, onProgress } = asked;
    runs.push(asked);
    running++;
    mostAtOnce = Math.max(mostAtOnce, running);
    try {
      for (let beat = 1; beat <= BEATS; beat++) onProgress?.(beat, BEATS);
      if (holds && runs.length === 1)
        await new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("the checks were stopped"))),
        );
      if (failWith) throw new Error(failWith);
      const report: CheckReport = {
        version: 1,
        checkedAt: "2026-11-23T10:00:00.000Z",
        beats: BEATS,
        warnings: [
          {
            check: "reading-speed",
            scene: "sign_in",
            beat: "start",
            at: 1.5,
            message: `run ${runs.length}`,
          },
        ],
        skipped: [...skip],
        filesKey: checkedFilesKey(project),
      };
      await writeFile(join(dir, "checks.json"), JSON.stringify(report));
      return report;
    } finally {
      running--;
    }
  };
  return { run, runs, mostAtOnce: () => mostAtOnce };
};

const setUp = ({
  failWith,
  mixFailsWith,
  missing = [],
  checks = fakeChecks(),
}: {
  failWith?: string;
  mixFailsWith?: string;
  missing?: MissingTool[];
  checks?: ReturnType<typeof fakeChecks>;
} = {}) => {
  const events = createEvents();
  const seen: string[] = [];
  events.subscribe((event) => {
    if (event.type === "preview-checks") seen.push(event.state);
  });
  const tts = fakeTts(failWith ? { failWith } : {}).tts;
  const sound = previewSound({
    projectsDir,
    tts,
    mix: fakeMix(mixFailsWith ? { failWith: mixFailsWith } : {}).mix,
    missingTools: async () => missing,
    events,
  });
  const jobs = previewChecks({
    projectsDir,
    sound,
    tts,
    run: checks.run,
    missingTools: async () => missing,
    events,
  });
  /** Starts the checks and waits until they are no longer running. */
  const settled = async (): Promise<ChecksRun> => {
    const started = await jobs.start("oauth");
    if (!started?.ok) throw new Error(JSON.stringify(started));
    for (let i = 0; i < 300; i++) {
      const { run } = await jobs.status("oauth");
      if (run.state === "done" || run.state === "failed") return run;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("the checks never settled");
  };
  return { checks, jobs, seen, sound, settled };
};

const editFile = (file: string, edit: (data: Record<string, unknown>) => unknown) => {
  const path = join(projectsDir, "oauth", file);
  writeFileSync(path, JSON.stringify(edit(JSON.parse(readFileSync(path, "utf8")))));
};

describe("previewChecks", () => {
  it("waits for the preview's sound, then checks with its voice and soundtrack, telling each beat", async () => {
    const { checks, jobs, seen, sound, settled } = setUp();
    expect(await jobs.status("oauth")).toEqual({
      run: { state: "idle" },
      report: null,
      upToDate: false,
    });
    expect(await settled()).toEqual({ state: "done" });

    const [run] = checks.runs;
    const ready = sound.status("oauth");
    if (!run || ready.state !== "ready") throw new Error("the checks did not run on the sound");
    expect(run.lines).toHaveLength(BEATS);
    expect(run.project.narration).toEqual(ready.narration);
    expect(run.soundtrack).toBe(sound.file("oauth", ready.key));
    expect(run.skip).toEqual([]);
    expect(seen[0]).toBe("waiting");
    expect(seen.filter((s) => s === "checking")).toHaveLength(BEATS + 1);
    expect(seen.at(-1)).toBe("done");

    const status = await jobs.status("oauth");
    expect(status.upToDate).toBe(true);
    expect(status.report?.warnings.map((w) => w.message)).toEqual(["run 1"]);
  });

  it("marks the report out of date once the files change", async () => {
    const { jobs, settled } = setUp();
    await settled();
    editFile("storyboard.json", (board) => {
      const scenes = board.scenes as { title: string }[];
      if (scenes[0]) scenes[0].title = "Another title";
      return board;
    });
    const status = await jobs.status("oauth");
    expect(status.report).not.toBeNull();
    expect(status.upToDate).toBe(false);
  });

  it("checks the files as they are once the sound is made for them, after an edit while waiting", async () => {
    const { checks, jobs, sound } = setUp();
    await jobs.start("oauth");
    // The sound for the old script is under way; the script changes before it settles.
    editFile("storyboard.json", (board) => {
      const scenes = board.scenes as { beats: { say?: string }[] }[];
      const beat = scenes[0]?.beats[0];
      if (beat) beat.say = "Someone opens the app.";
      return board;
    });
    for (let i = 0; i < 300 && (await jobs.status("oauth")).run.state !== "done"; i++)
      await new Promise((r) => setTimeout(r, 10));
    const [run] = checks.runs;
    const ready = sound.status("oauth");
    if (!run || ready.state !== "ready") throw new Error("the checks did not run on the sound");
    expect(run.project.storyboard.scenes[0]?.beats[0]?.say).toBe("Someone opens the app.");
    expect(ready.key).toBe(sound.keyOf(run.project));
    expect(run.soundtrack).toBe(sound.file("oauth", ready.key));
    expect((await jobs.status("oauth")).upToDate).toBe(true);
  });

  it("stops an older run for a newer one, and runs them one after the other", async () => {
    const checks = fakeChecks({ holds: true });
    const { jobs, settled } = setUp({ checks });
    await jobs.start("oauth");
    for (let i = 0; i < 300 && checks.runs.length === 0; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(await settled()).toEqual({ state: "done" });
    expect(checks.runs).toHaveLength(2);
    expect(checks.runs[0]?.signal?.aborted).toBe(true);
    expect(checks.mostAtOnce()).toBe(1);
    const status = await jobs.status("oauth");
    expect(status.report?.warnings.map((w) => w.message)).toEqual(["run 2"]);
  });

  it("skips narration fit and loudness, saying why, when the voice failed", async () => {
    const { checks, settled } = setUp({ failWith: "the voice model did not load: offline" });
    expect(await settled()).toEqual({ state: "done" });
    expect(checks.runs[0]?.skip).toEqual([
      { checks: ["narration-fit", "loudness"], reason: "the voice did not generate" },
    ]);
  });

  it("skips loudness with the mix's own words when the soundtrack did not mix", async () => {
    const { checks, settled } = setUp({ mixFailsWith: "ffmpeg was stopped" });
    expect(await settled()).toEqual({ state: "done" });
    expect(checks.runs[0]?.skip).toEqual([
      { checks: ["loudness"], reason: "the soundtrack did not mix: ffmpeg was stopped" },
    ]);
    expect(checks.runs[0]?.lines).toHaveLength(BEATS);
  });

  it("skips what this machine lacks the tools for", async () => {
    const { checks, settled } = setUp({
      missing: [
        { tool: "chrome", message: "Chrome is not installed" },
        { tool: "ffmpeg", message: "ffmpeg is not installed" },
      ],
    });
    expect(await settled()).toEqual({ state: "done" });
    expect(checks.runs[0]?.skip).toEqual([
      { checks: ["overlap", "off-frame"], reason: "Chrome is not available" },
      { checks: ["loudness"], reason: "ffmpeg is not available" },
    ]);
  });

  it("measures nothing for a silent video", async () => {
    editFile("config.json", (config) => ({
      ...config,
      voice: { enabled: false },
      music: { enabled: false },
    }));
    const { checks, settled } = setUp();
    expect(await settled()).toEqual({ state: "done" });
    expect(checks.runs[0]?.soundtrack).toBeNull();
    expect(checks.runs[0]?.lines).toEqual([]);
  });

  it("says why the checks could not run", async () => {
    const { settled } = setUp({ checks: fakeChecks({ failWith: "Chrome crashed" }) });
    expect(await settled()).toEqual({ state: "failed", message: "Chrome crashed" });
  });

  it("names what the checks need when the script is missing", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const started = await setUp().jobs.start("oauth");
    expect(started?.ok === false && started.errors[0]?.path).toBe("storyboard.json");
  });

  it("knows no project that does not exist", async () => {
    expect(await setUp().jobs.start("nope")).toBeUndefined();
  });
});
