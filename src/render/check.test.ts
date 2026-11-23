import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { CheckReportSchema } from "../schema/checks.ts";
import { checkLayout, checkProjectFolder } from "./check.ts";
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

  it("looks at every beat, at its midpoint", async () => {
    const project = await example();
    const { beats } = await checkLayout({ project, pageUrl: server.url });
    expect(beats).toBe(
      buildBeats(project.storyboard, project.graph, beatOptions(project.config)).beats.length,
    );
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
  }, 120_000);
});
