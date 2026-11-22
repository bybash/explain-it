import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { measureLoudness } from "../audio/master.ts";
import { makeSoundtrack } from "../audio/soundtrack.ts";
import type { VoiceLine } from "../audio/voice.ts";
import { layoutWarnings } from "../checks/layout.ts";
import { stillAt } from "../checks/sheet.ts";
import { loudnessWarnings, narrationFitWarnings, readingWarnings } from "../checks/timing.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import {
  type BeatSpan,
  type BeatWarning,
  type CheckReport,
  type CheckWarning,
  ShapeSchema,
  type SkippedChecks,
} from "../schema/checks.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import type { MissingTool } from "./environment.ts";
import type { ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import { beatsOnPage, launchBrowser, openPage } from "./render.ts";
import { CONTACT_SHEET, drawSheet } from "./sheet.ts";

/** What the render page exposes for the checks (see `expose` in the engine's player). */
type Checkable = {
  __seek: (t: number) => void;
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
}): Promise<{
  readonly beats: number;
  readonly warnings: CheckWarning[];
  /** Each beat's span and its still at the midpoint, for the contact sheet. */
  readonly spans: readonly BeatSpan[];
  readonly stills: readonly Buffer[];
}> => {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, pageUrl, { ...project, mode: "light" });
    const beats = await beatsOnPage(page);
    const warnings: CheckWarning[] = [];
    const stills: Buffer[] = [];
    for (const beat of beats) {
      const at = stillAt(beat);
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
      stills.push(await page.screenshot({ type: "png" }));
    }
    return { beats: beats.length, warnings, spans: beats, stills };
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
 * The checks that cannot run this time, and why: the layout checks need
 * Chrome, loudness needs ffmpeg, and narration fit and loudness need the
 * voice. Reading speed always runs.
 */
export const skippedChecks = (
  missing: readonly MissingTool[],
  voiceFailed: boolean,
): SkippedChecks[] => {
  const lacks = (tool: MissingTool["tool"]) => missing.some((m) => m.tool === tool);
  const skipped: SkippedChecks[] = [];
  if (lacks("chrome"))
    skipped.push({ checks: ["overlap", "off-frame"], reason: "Chrome is not available" });
  if (voiceFailed)
    skipped.push({ checks: ["narration-fit", "loudness"], reason: "the voice did not generate" });
  else if (lacks("ffmpeg"))
    skipped.push({ checks: ["loudness"], reason: "ffmpeg is not available" });
  return skipped;
};

/**
 * The contact sheets beside the report: full size (PNG) and small (JPEG,
 * for an agent), each still marked with the warnings at its beat.
 */
const writeSheets = async (
  dir: string,
  {
    beats,
    stills,
    warnings,
  }: {
    readonly beats: readonly BeatSpan[];
    readonly stills: readonly Buffer[];
    readonly warnings: readonly CheckWarning[];
  },
) => {
  const atBeats = warnings.filter((w): w is BeatWarning => "beat" in w);
  const browser = await launchBrowser();
  try {
    for (const size of ["full", "small"] as const) {
      const image = await drawSheet(browser, { beats, stills, warnings: atBeats, size });
      await writeFile(join(dir, `${CONTACT_SHEET[size]}.partial`), image);
      await rename(join(dir, `${CONTACT_SHEET[size]}.partial`), join(dir, CONTACT_SHEET[size]));
    }
    return CONTACT_SHEET;
  } finally {
    await browser.close();
  }
};

/** The layout checks on the project's page: the render page built, served for the length of them. */
const layoutOnPage = async (project: ProjectFiles) => {
  const page = await buildRenderPage();
  try {
    const server = await serveRenderPage(page.dir);
    try {
      return await checkLayout({ project, pageUrl: server.url });
    } finally {
      await server.close();
    }
  } finally {
    await page.remove();
  }
};

/**
 * Runs every check on a loaded project (layout on its page, reading speed
 * and narration fit from its beat plan, loudness on its soundtrack), except
 * those `skip` names with a reason, and writes the report as `checks.json`
 * in its folder, written whole and then renamed, for the Preview gate and
 * the tools to read.
 */
export const checkProjectFolder = async ({
  dir,
  project,
  lines,
  skip = [],
  now,
}: {
  readonly dir: string;
  readonly project: ProjectFiles;
  /** The voice's lines (see `withNarration`), for the soundtrack the loudness check measures. */
  readonly lines: readonly VoiceLine[];
  /** Checks that cannot run this time, and why: a program missing, the voice failed. */
  readonly skip?: readonly SkippedChecks[];
  readonly now: Date;
}): Promise<CheckReport> => {
  const skipped = new Set(skip.flatMap((s) => s.checks));
  const plan = buildBeats(
    project.storyboard,
    project.graph,
    beatOptions(project.config, project.narration),
  );
  const layout = skipped.has("overlap")
    ? { beats: plan.beats.length, warnings: [], spans: [], stills: [] }
    : await layoutOnPage(project);
  const warnings = [
    ...layout.warnings,
    ...readingWarnings(plan),
    ...(skipped.has("narration-fit") ? [] : narrationFitWarnings(plan, project.narration ?? {})),
    ...(skipped.has("loudness") ? [] : await checkSoundtrack({ project, lines })),
  ];
  const contactSheet =
    layout.stills.length > 0
      ? await writeSheets(dir, { beats: layout.spans, stills: layout.stills, warnings })
      : undefined;
  // Without stills there is no sheet, and an older one would show a project that has changed.
  if (!contactSheet)
    await Promise.all(
      Object.values(CONTACT_SHEET).map((name) => rm(join(dir, name), { force: true })),
    );
  const report: CheckReport = {
    version: 1,
    checkedAt: now.toISOString(),
    beats: layout.beats,
    warnings,
    skipped: [...skip],
    ...(contactSheet ? { contactSheet } : {}),
  };
  const file = join(dir, "checks.json");
  await writeFile(`${file}.partial`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${file}.partial`, file);
  return report;
};
