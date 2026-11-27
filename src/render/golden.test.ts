import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compareStills,
  exampleNames,
  exampleStills,
  GOLDEN_DIR,
  GOLDEN_TOLERANCE,
} from "./golden.ts";
import { buildRenderPage, type RenderPageBuild, serveRenderPage } from "./page.ts";
import { launchBrowser } from "./render.ts";

/**
 * The golden stills (6.3, decision 046): each example's beats, compared with
 * the stills kept in golden/. They are made in the Docker image's Chromium
 * and fonts, so they run there only, where GOLDEN_STILLS=1 is set: in CI and
 * with `npm run golden:check`. A still that differs is written, with an image of
 * the difference, to GOLDEN_OUT (golden-out/ by default).
 */
const OUT = resolve(process.env.GOLDEN_OUT ?? "golden-out");

describe.skipIf(process.env.GOLDEN_STILLS !== "1")("golden stills", () => {
  let build: RenderPageBuild;
  let server: Awaited<ReturnType<typeof serveRenderPage>>;
  let browser: Browser;
  let tools: Page;
  beforeAll(async () => {
    build = await buildRenderPage();
    server = await serveRenderPage(build.dir);
    browser = await launchBrowser();
    tools = await browser.newPage();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    await build?.remove();
  });

  it.each(exampleNames())(
    "%s looks as its golden stills do",
    async (name) => {
      const stills = await exampleStills(browser, server.url, name);
      const dir = join(GOLDEN_DIR, name);
      const kept = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
      const problems: string[] = [];
      for (const still of stills) {
        const file = join(dir, `${still.name}.png`);
        if (!existsSync(file)) {
          problems.push(`${still.name}: no golden still; run \`npm run golden\``);
          continue;
        }
        const compared = await compareStills(tools, readFileSync(file), still.png);
        if (compared.changed <= compared.total * GOLDEN_TOLERANCE.share) continue;
        const share = ((100 * compared.changed) / compared.total).toFixed(2);
        problems.push(`${still.name}: ${share}% of its pixels changed`);
        mkdirSync(join(OUT, name), { recursive: true });
        writeFileSync(join(OUT, name, `${still.name}.png`), still.png);
        writeFileSync(join(OUT, name, `${still.name}-diff.png`), compared.diff);
      }
      const made = new Set(stills.map((s) => `${s.name}.png`));
      for (const file of kept)
        if (!made.has(file)) problems.push(`${file}: a golden still for a beat that is gone`);
      expect(problems).toEqual([]);
    },
    240_000,
  );
});
