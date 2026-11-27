// Makes the golden stills in golden/ again (6.3, decision 046), from the
// examples as they are now. Run it in the Docker test image, where CI checks
// them, so the fonts and Chromium are the same: `npm run golden` builds the
// image for CI's processor and writes golden/ through a mounted folder.
// `npm run golden:check` runs the check (src/render/golden.test.ts) there.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exampleNames, exampleStills, GOLDEN_DIR } from "../src/render/golden.ts";
import { buildRenderPage, serveRenderPage } from "../src/render/page.ts";
import { launchBrowser } from "../src/render/render.ts";

const build = await buildRenderPage();
const server = await serveRenderPage(build.dir);
const browser = await launchBrowser();
try {
  // Stills of an example that is gone go with it.
  if (existsSync(GOLDEN_DIR))
    for (const entry of readdirSync(GOLDEN_DIR, { withFileTypes: true }))
      if (entry.isDirectory() && !exampleNames().includes(entry.name))
        rmSync(join(GOLDEN_DIR, entry.name), { recursive: true, force: true });
  for (const name of exampleNames()) {
    const stills = await exampleStills(browser, server.url, name);
    const dir = join(GOLDEN_DIR, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const still of stills) writeFileSync(join(dir, `${still.name}.png`), still.png);
    console.log(`${name}: ${stills.length} stills`);
  }
  console.log(`golden/ now holds ${readdirSync(GOLDEN_DIR).length} examples`);
} finally {
  await browser.close();
  await server.close();
  await build.remove();
}
