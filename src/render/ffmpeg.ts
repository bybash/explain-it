import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

/**
 * Runs ffmpeg with `args`, lets `feed` write frames to its stdin, and waits
 * for it to finish. On any failure the output (ffmpeg's last argument) is
 * removed, so a failed render never leaves a file that looks like a result.
 */
export const pipeFrames = async (
  args: readonly string[],
  feed: (write: (frame: Buffer) => Promise<void>) => Promise<void>,
): Promise<void> => {
  const out = args.at(-1);
  const ffmpeg = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let quit = false;
  const exited = new Promise<void>((resolve, reject) => {
    ffmpeg.on("error", (error) => {
      quit = true;
      reject(
        new Error(`could not run ffmpeg (${FFMPEG}): ${error.message}; install it or set FFMPEG`),
      );
    });
    ffmpeg.on("exit", () => {
      quit = true;
    });
    ffmpeg.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}:\n${stderr}`)),
    );
  });
  // A failed start rejects `exited`; keep it from going unhandled while frames are written.
  exited.catch(() => {});
  // A write to an ffmpeg that has quit fails in its callback; without a listener it would also crash.
  ffmpeg.stdin.on("error", () => {});
  const write = (frame: Buffer) =>
    new Promise<void>((resolve, reject) => {
      ffmpeg.stdin.write(frame, (error) => (error ? reject(error) : resolve()));
    });
  try {
    try {
      await feed(write);
    } catch (error) {
      const ffmpegFailed = quit || (error as NodeJS.ErrnoException).code === "EPIPE";
      // Ending stdin would let ffmpeg finish a short video; stop it instead.
      ffmpeg.kill("SIGKILL");
      const ffmpegError = await exited.then(
        () => undefined,
        (reason: unknown) => reason,
      );
      // When ffmpeg quit by itself, its own message says why; a broken pipe does not.
      throw ffmpegFailed && ffmpegError ? ffmpegError : error;
    }
    ffmpeg.stdin.end();
    await exited;
  } catch (error) {
    if (out) await rm(out, { force: true });
    throw error;
  }
};
