// Records a dev page to MP4, for PR evidence: seeks the page's `__seek(t)`
// frame by frame (never real time), then encodes with ffmpeg.
// Usage: node scripts/dev-clip.ts dev/iso.html docs/clips/edges.mp4 [seconds]
// Needs ffmpeg on the PATH, or its path in FFMPEG. Slice 1.9 brings the real capture.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const FPS = 30;
const [page = "dev/iso.html", out = "docs/clips/clip.mp4", limit] = process.argv.slice(2);
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

type Seekable = { __seek: (t: number) => void; __duration: number };

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("dev server did not start");

const frames = mkdtempSync(join(tmpdir(), "explain-it-clip-"));
const browser = await chromium.launch({ channel: "chrome" });
try {
  const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  tab.on("pageerror", (error) => errors.push(error.message));
  // A `t` parameter keeps the page from playing on its own while it is captured.
  const target = new URL(page, url);
  target.searchParams.set("t", "0");
  await tab.goto(target.href);
  await tab.waitForSelector("body[data-ready=true]", { timeout: 10_000 });
  if (errors.length > 0) throw new Error(`page errors:\n${errors.join("\n")}`);
  const duration = await tab.evaluate(() => (window as unknown as Seekable).__duration);
  const seconds = Math.min(duration, limit === undefined ? duration : Number(limit));
  const count = Math.ceil(seconds * FPS);
  for (let i = 0; i <= count; i++) {
    await tab.evaluate((t) => (window as unknown as Seekable).__seek(t), i / FPS);
    await tab.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.png`) });
  }
  const input = ["-framerate", String(FPS), "-i", join(frames, "%05d.png")];
  const encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", out];
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", ...input, ...encode], { stdio: "inherit" });
  console.log(`saved ${out} (${count + 1} frames, ${seconds.toFixed(1)} s)`);
} finally {
  await browser.close();
  await server.close();
  rmSync(frames, { recursive: true, force: true });
}
