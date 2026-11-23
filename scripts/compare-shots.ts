// Compares two folders of screenshots from scripts/app-shots.ts, pixel by pixel, and writes
// an image of each difference: the changed pixels in red over a faded copy of the first.
// Usage: node scripts/compare-shots.ts <before-dir> <after-dir> <diff-dir>
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [before, after, diffs] = process.argv.slice(2);
if (!before || !after || !diffs)
  throw new Error("usage: node scripts/compare-shots.ts <before-dir> <after-dir> <diff-dir>");
mkdirSync(diffs, { recursive: true });

/** How far a channel may move before the pixel counts as changed: anti-aliasing moves a few steps. */
const CHANNEL_TOLERANCE = 24;

const raw = (file: string) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let changedShots = 0;
for (const name of readdirSync(before)
  .filter((f) => f.endsWith(".png"))
  .sort()) {
  const a = await raw(join(before, name));
  const b = await raw(join(after, name)).catch(() => undefined);
  if (!b) {
    console.log(`${name}: missing after`);
    changedShots++;
    continue;
  }
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(
      `${name}: size ${a.info.width}×${a.info.height} became ${b.info.width}×${b.info.height}`,
    );
    changedShots++;
    continue;
  }
  const out = Buffer.alloc(a.data.length);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const moved = [0, 1, 2].some(
      (c) => Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0)) > CHANNEL_TOLERANCE,
    );
    if (moved) changed++;
    out[i] = moved ? 255 : 200 + ((a.data[i] ?? 0) >> 3);
    out[i + 1] = moved ? 0 : 200 + ((a.data[i + 1] ?? 0) >> 3);
    out[i + 2] = moved ? 0 : 200 + ((a.data[i + 2] ?? 0) >> 3);
    out[i + 3] = 255;
  }
  const share = (changed / (a.data.length / 4)) * 100;
  console.log(`${name}: ${changed} pixels changed (${share.toFixed(3)}%)`);
  if (changed > 0) {
    changedShots++;
    await sharp(out, { raw: { width: a.info.width, height: a.info.height, channels: 4 } })
      .png()
      .toFile(join(diffs, name));
  }
}
console.log(changedShots === 0 ? "all the same" : `${changedShots} changed`);
