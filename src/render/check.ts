import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { layoutWarnings } from "../checks/layout.ts";
import { type CheckReport, type CheckWarning, ShapeSchema } from "../schema/checks.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import type { ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import { launchBrowser, openPage } from "./render.ts";

/** What the render page exposes for the checks (see `expose` in the engine's player). */
type Checkable = {
  __seek: (t: number) => void;
  __beats: { id: string; scene: string; start: number; end: number }[];
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
    const beats = await page.evaluate(() => (window as unknown as Checkable).__beats);
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

/**
 * Checks a loaded project and writes the report as `checks.json` in its
 * folder, written whole and then renamed, for the Preview gate and the
 * tools to read. Builds and serves the render page for the length of it.
 */
export const checkProjectFolder = async ({
  dir,
  project,
  now,
}: {
  readonly dir: string;
  readonly project: ProjectFiles;
  readonly now: Date;
}): Promise<CheckReport> => {
  const page = await buildRenderPage();
  try {
    const server = await serveRenderPage(page.dir);
    try {
      const { beats, warnings } = await checkLayout({ project, pageUrl: server.url });
      const report: CheckReport = { version: 1, checkedAt: now.toISOString(), beats, warnings };
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
