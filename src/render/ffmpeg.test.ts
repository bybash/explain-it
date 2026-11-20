import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeArgs } from "./encode.ts";
import { pipeFrames } from "./ffmpeg.ts";
import { FPS } from "./frames.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("pipeFrames (ffmpeg)", () => {
  const out = mkdtempSync(join(tmpdir(), "explain-it-ffmpeg-"));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  /** A small solid PNG; the size is even, as H.264 needs. Made in a hook, so a skipped suite never runs ffmpeg. */
  let frame: Buffer;
  beforeAll(() => {
    frame = execFileSync("ffmpeg", [
      ...["-loglevel", "error", "-f", "lavfi", "-i", "color=c=teal:s=64x64"],
      ...["-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
    ]);
  });
  const args = (file: string) => encodeArgs({ fps: FPS, resolution: "1080p", out: file });

  it("encodes the frames it is fed", async () => {
    const video = join(out, "ok.mp4");
    await pipeFrames(args(video), async (write) => {
      for (let i = 0; i < 10; i++) await write(frame);
    });
    expect(existsSync(video)).toBe(true);
  });

  it("fails with the feed's error and leaves no video when feeding fails part way", async () => {
    const video = join(out, "partial.mp4");
    await expect(
      pipeFrames(args(video), async (write) => {
        for (let i = 0; i < 300; i++) await write(frame);
        // Give ffmpeg time to start writing the file, as it has deep into a real render.
        await new Promise((resolve) => setTimeout(resolve, 500));
        throw new Error("page crashed at frame 300");
      }),
    ).rejects.toThrow("page crashed at frame 300");
    expect(existsSync(video)).toBe(false);
  });

  it("reports ffmpeg's own error when ffmpeg stops reading", async () => {
    const video = join(out, "bad.mp4");
    await expect(
      pipeFrames([...args(video).slice(0, -1), "-c:v", "no-such-codec", video], async (write) => {
        // Far more than the pipe holds, so writes fail once ffmpeg has quit.
        for (let i = 0; i < 5000; i++) await write(frame);
      }),
    ).rejects.toThrow(/ffmpeg exited with \d+:[\s\S]*no-such-codec/);
  });
});
