// Renders a dev page in headless Chrome and saves a PNG, for PR evidence.
// Usage: node scripts/dev-screenshot.ts dev/iso.html docs/screenshots/iso.png
import { chromium } from "playwright-core";
import { createServer } from "vite";

const [page = "dev/iso.html", out = "docs/screenshots/iso.png"] = process.argv.slice(2);

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("dev server did not start");

const browser = await chromium.launch({ channel: "chrome" });
try {
  const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  tab.on("pageerror", (error) => errors.push(error.message));
  await tab.goto(new URL(page, url).href);
  await tab.waitForSelector("body[data-ready=true]", { timeout: 10_000 }).catch(() => undefined);
  if (errors.length > 0) throw new Error(`page errors:\n${errors.join("\n")}`);
  await tab.screenshot({ path: out });
  console.log(`saved ${out}`);
} finally {
  await browser.close();
  await server.close();
}
