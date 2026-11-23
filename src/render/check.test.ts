import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sheetLayout } from "../checks/sheet.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { CheckReportSchema } from "../schema/checks.ts";
import { checkLayout, checkProjectFolder } from "./check.ts";
import { checkedFilesKey } from "./check-files.ts";
import { loadProject, type ProjectFiles } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";

// The whole check also measures a soundtrack, so it needs ffmpeg too.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

const example = async (): Promise<ProjectFiles> => {
  const loaded = await loadProject(resolve("examples/oauth-login"));
  if (!loaded.ok) throw new Error("the example does not load");
  return loaded.value;
};

/** The example with "browser" moved by hand onto "user", as a manual override would. */
const overlapping = async (): Promise<ProjectFiles> => {
  const project = await example();
  const user = project.layout.positions.user ?? { x: 0, y: 0 };
  const onto = { x: user.x + 1, y: user.y };
  // Moving a node by hand leaves its edges' routes to be found again, so they are cleared.
  const touching = project.graph.edges.filter((e) => e.from === "browser" || e.to === "browser");
  return {
    ...project,
    layout: {
      ...project.layout,
      positions: { ...project.layout.positions, browser: onto },
      overrides: { ...project.layout.overrides, browser: onto },
      routes: {
        ...project.layout.routes,
        ...Object.fromEntries(touching.map((e) => [e.id, null])),
      },
    },
  };
};

describe.skipIf(!hasChrome)("the layout checks on the render page (Chrome)", () => {
  let page: Awaited<ReturnType<typeof buildRenderPage>>;
  let server: Awaited<ReturnType<typeof serveRenderPage>>;
  beforeAll(async () => {
    page = await buildRenderPage();
    server = await serveRenderPage(page.dir);
  }, 60_000);
  afterAll(async () => {
    await server?.close();
    await page?.remove();
  });

  it("looks at every beat, at its midpoint, telling how far it is", async () => {
    const project = await example();
    const told: [number, number][] = [];
    const { beats } = await checkLayout({
      project,
      pageUrl: server.url,
      onProgress: (checked, total) => told.push([checked, total]),
    });
    expect(beats).toBe(
      buildBeats(project.storyboard, project.graph, beatOptions(project.config)).beats.length,
    );
    expect(told).toEqual(Array.from({ length: beats }, (_, i) => [i + 1, beats]));
  }, 60_000);

  it("stops when asked to", async () => {
    const stop = new AbortController();
    const checking = checkLayout({
      project: await example(),
      pageUrl: server.url,
      signal: stop.signal,
      onProgress: () => stop.abort(),
    });
    await expect(checking).rejects.toThrow(/stopped/);
  }, 60_000);

  it("reports a box an override moved onto another, at the beats it shows in", async () => {
    const { warnings } = await checkLayout({ project: await overlapping(), pageUrl: server.url });
    const caught = warnings.filter((w) =>
      w.message.startsWith('node "user" and node "browser" overlap by'),
    );
    expect(caught.length).toBeGreaterThan(0);
    expect(caught[0]).toMatchObject({ check: "overlap", scene: "sign_in" });
    expect(caught[0] && "px" in caught[0] ? caught[0].px : 0).toBeGreaterThan(4);
  }, 60_000);
});

describe.skipIf(!hasChrome || !hasFfmpeg)("checkProjectFolder (Chrome and ffmpeg)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "explain-it-check-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes the report as checks.json in the project's folder", async () => {
    const report = await checkProjectFolder({
      dir,
      project: await overlapping(),
      lines: [],
      now: new Date("2026-11-22T10:00:00.000Z"),
    });
    const written = CheckReportSchema.parse(
      JSON.parse(readFileSync(join(dir, "checks.json"), "utf8")),
    );
    expect(written).toEqual(report);
    expect(written.checkedAt).toBe("2026-11-22T10:00:00.000Z");
    expect(written.warnings.some((w) => w.message.includes('node "browser"'))).toBe(true);
    // The contact sheet beside it: one tile per beat, its beats with warnings marked.
    expect(written.contactSheet).toEqual({ full: "contact-sheet.png", small: "contact-sheet.jpg" });
    const png = readFileSync(join(dir, "contact-sheet.png"));
    const size = sheetLayout({
      beats: Array.from({ length: written.beats }, (_, i) => ({
        id: `b${i}`,
        scene: "s",
        start: i,
        end: i + 1,
      })),
      warnings: [],
      tileWidth: 480,
    });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size.width, size.height]);
    const jpeg = readFileSync(join(dir, "contact-sheet.jpg"));
    expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(jpeg.length).toBeLessThan(png.length);
  }, 120_000);
});

describe("checkProjectFolder, with only the checks that need no tools", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "explain-it-check-key-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const skipAll = [
    { checks: ["overlap", "off-frame"] as const, reason: "Chrome is not available" },
    { checks: ["narration-fit", "loudness"] as const, reason: "the voice did not generate" },
  ].map((s) => ({ ...s, checks: [...s.checks] }));

  it("names the files it checked, so a reader can tell when they have changed", async () => {
    const project = await example();
    const report = await checkProjectFolder({
      dir,
      project,
      lines: [],
      skip: skipAll,
      now: new Date("2026-11-22T10:00:00.000Z"),
    });
    expect(report.filesKey).toBe(checkedFilesKey(project));
    expect(
      CheckReportSchema.parse(JSON.parse(readFileSync(join(dir, "checks.json"), "utf8"))).filesKey,
    ).toBe(report.filesKey);
  });

  it("keys the graph, the script, the layout and the style, and not the measured voice", async () => {
    const project = await example();
    const key = checkedFilesKey(project);
    const voiced: ProjectFiles = { ...project, narration: { start: 3 } };
    expect(checkedFilesKey(voiced)).toBe(key);
    const [scene, ...rest] = project.storyboard.scenes;
    if (!scene) throw new Error("the example has no scene");
    const retitled = { ...project.storyboard, scenes: [{ ...scene, title: "Another" }, ...rest] };
    expect(checkedFilesKey({ ...project, storyboard: retitled })).not.toBe(key);
    expect(
      checkedFilesKey({
        ...project,
        layout: { ...project.layout, overrides: { user: { x: 1, y: 1 } } },
      }),
    ).not.toBe(key);
    expect(
      checkedFilesKey({ ...project, config: { ...project.config, font: "manrope" } }),
    ).not.toBe(key);
  });
});
