import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { measureLoudness } from "../audio/master.ts";
import { makeSoundtrack } from "../audio/soundtrack.ts";
import type { VoiceLine } from "../audio/voice.ts";
import { layoutWarnings } from "../checks/layout.ts";
import { loudnessWarnings, narrationFitWarnings, readingWarnings } from "../checks/timing.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import {
  BeatSpanSchema,
  type CheckReport,
  type CheckWarning,
  ShapeSchema,
} from "../schema/checks.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import type { ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import { launchBrowser, openPage } from "./render.ts";

/** What the render page exposes for the checks (see `expose` in the engine's player). */
type Checkable = {
  __seek: (t: number) => void;
  __beats: unknown;
  __shapes: () => unknown;
};

const ShapesSchema = z.array(ShapeSchema);

/**
 * The layout checks (SPEC, Checks): the project's page in Chrome, seeked to
 * each beat's midpoint, reports everything it draws there; the core finds
 * overlaps and anything off the safe area. The theme does not move
 * anything, so one is enough.
 */
export const checkLayout = async ({
  project,
  pageUrl,
}: {
  readonly project: ProjectFiles;
  readonly pageUrl: string;
}): Promise<{ readonly beats: number; readonly warnings: CheckWarning[] }> => {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, pageUrl, { ...project, mode: "light" });
    const reported = parseWith(
      z.array(BeatSpanSchema),
      await page.evaluate(() => (window as unknown as Checkable).__beats),
    );
    if (!reported.ok)
      throw new Error(
        `the render page reported beats it should not:\n${formatErrors(reported.errors).join("\n")}`,
      );
    const beats = reported.value;
    const warnings: CheckWarning[] = [];
    for (const beat of beats) {
      const at = Math.round(((beat.start + beat.end) / 2) * 1000) / 1000;
      const drawn = await page.evaluate((t) => {
        const w = window as unknown as Checkable;
        w.__seek(t);
        return w.__shapes();
      }, at);
      // The page is ours, so shapes it cannot describe are a bug, not a warning.
      const shapes = parseWith(ShapesSchema, drawn);
      if (!shapes.ok)
        throw new Error(
          `the render page reported shapes it should not:\n${formatErrors(shapes.errors).join("\n")}`,
        );
      warnings.push(...layoutWarnings(shapes.value, { scene: beat.scene, beat: beat.id, at }));
    }
    return { beats: beats.length, warnings };
  } finally {
    await browser.close();
  }
};

/** A loudness meter: the real one is ffmpeg's EBU R128 (`measureLoudness`). */
type Meter = (file: string) => Promise<{ readonly integrated: number; readonly truePeak: number }>;

/**
 * The loudness check (SPEC, Checks): the soundtrack a render would make,
 * mixed and mastered into a scratch file, measured, then removed. Without a
 * voice or music there is nothing to measure.
 */
export const checkSoundtrack = async ({
  project,
  lines,
  measure = measureLoudness,
}: {
  readonly project: ProjectFiles;
  readonly lines: readonly VoiceLine[];
  readonly measure?: Meter | undefined;
}): Promise<CheckWarning[]> => {
  const scratch = await mkdtemp(join(tmpdir(), "explain-it-check-"));
  try {
    const file = await makeSoundtrack({ project, lines, out: join(scratch, "audio.wav") });
    return file ? loudnessWarnings(await measure(file)) : [];
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/**
 * Runs every check on a loaded project (layout on its page, timing from its
 * beat plan, loudness on its soundtrack) and writes the report as
 * `checks.json` in its folder, written whole and then renamed, for the
 * Preview gate and the tools to read.
 */
export const checkProjectFolder = async ({
  dir,
  project,
  lines = [],
  now,
}: {
  readonly dir: string;
  readonly project: ProjectFiles;
  /** The voice's lines (see `withNarration`), for the soundtrack the loudness check measures. */
  readonly lines?: readonly VoiceLine[];
  readonly now: Date;
}): Promise<CheckReport> => {
  const page = await buildRenderPage();
  try {
    const server = await serveRenderPage(page.dir);
    try {
      const layout = await checkLayout({ project, pageUrl: server.url });
      const plan = buildBeats(
        project.storyboard,
        project.graph,
        beatOptions(project.config, project.narration),
      );
      const warnings = [
        ...layout.warnings,
        ...readingWarnings(plan),
        ...narrationFitWarnings(plan, project.narration ?? {}),
        ...(await checkSoundtrack({ project, lines })),
      ];
      const report: CheckReport = {
        version: 1,
        checkedAt: now.toISOString(),
        beats: layout.beats,
        warnings,
      };
      const file = join(dir, "checks.json");
      await writeFile(`${file}.partial`, `${JSON.stringify(report, null, 2)}\n`);
      await rename(`${file}.partial`, file);
      return report;
    } finally {
      await server.close();
    }
  } finally {
    await page.remove();
  }
};
