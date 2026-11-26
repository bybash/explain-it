import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { problemKey, sayProblem } from "../checks/chat-report.ts";
import { repairLayout } from "../llm/drafting.ts";
import { FIXTURES_DIR, fixtureClient } from "../llm/fixtures.ts";
import { CROWDED_PROBLEMS, crowded } from "../llm/recordings.ts";
import type { CheckWarning } from "../schema/checks.ts";
import { orThrow } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { laidOut } from "../server/graphs.ts";
import { checkLayout } from "./check.ts";
import { loadProject } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";

const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

/** The layout problems Chrome finds in a project of these files, with the example's style. */
const layoutProblems = async (url: string, files: { graph: Graph; storyboard: Storyboard }) => {
  const dir = mkdtempSync(join(tmpdir(), "explain-it-crowded-"));
  try {
    // The example's own files, but none of what checks and renders leave.
    cpSync(resolve("examples/oauth-login"), dir, {
      recursive: true,
      filter: (source) => !/[/\\](out|cache|checks\.json|contact-sheet[^/\\]*)$/.test(source),
    });
    writeFileSync(join(dir, "graph.json"), JSON.stringify(files.graph));
    writeFileSync(join(dir, "storyboard.json"), JSON.stringify(files.storyboard));
    const layout = orThrow(await laidOut(files.graph, null), "layout");
    writeFileSync(join(dir, "layout.json"), JSON.stringify(layout));
    const project = await loadProject(dir);
    if (!project.ok)
      throw new Error(`the project does not load: ${JSON.stringify(project.errors)}`);
    const { warnings } = await checkLayout({ project: project.value, pageUrl: url });
    return warnings.filter((w): w is Extract<CheckWarning, { beat: string }> => "beat" in w);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Each problem once, as the chat says it. */
const said = (warnings: readonly CheckWarning[]) => {
  const once = new Map(
    warnings.map((warning) => [problemKey({ kind: "warning", warning }), warning]),
  );
  return [...once.values()].map((warning) => sayProblem({ kind: "warning", warning }));
};

describe.skipIf(!hasChrome)("layout repair on the crowded project (Chrome)", () => {
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

  it("finds layout problems in the crowded project", async () => {
    // CROWDED_PROBLEMS is what Chrome found here when the repair was recorded; fonts may move a pixel elsewhere.
    expect((await layoutProblems(server.url, crowded())).length).toBeGreaterThan(0);
  }, 120_000);

  it("leaves no layout problem once the recorded repair is applied", async () => {
    const repaired = await repairLayout(fixtureClient({ dir: FIXTURES_DIR }), {
      ...crowded(),
      problems: CROWDED_PROBLEMS,
    });
    if (!repaired.ok) throw new Error("the recorded repair does not replay");
    expect(said(await layoutProblems(server.url, repaired.value))).toEqual([]);
  }, 120_000);
});
