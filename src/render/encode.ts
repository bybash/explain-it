import { STAGE } from "../schema/checks.ts";
import type { Resolution } from "../schema/config.ts";

/** Output frame sizes. The stage is always captured at 1080p and scaled down. */
export const RESOLUTION_SIZES: Readonly<
  Record<Resolution, { readonly width: number; readonly height: number }>
> = {
  "1080p": STAGE,
  "720p": { width: 1280, height: 720 },
};

/** Scales a 1080p capture to `resolution`, or nothing at 1080p. */
const scaleTo = (resolution: Resolution): string[] => {
  const { width, height } = RESOLUTION_SIZES[resolution];
  return resolution === "1080p" ? [] : ["-vf", `scale=${width}:${height}:flags=lanczos`];
};

/**
 * ffmpeg arguments that read PNG frames from stdin at `fps` and write an
 * H.264 MP4 to `out`, scaled to `resolution`, playable while it downloads,
 * with the soundtrack when there is one.
 */

export const encodeArgs = ({
  fps,
  resolution,
  out,
  audio,
}: {
  readonly fps: number;
  readonly resolution: Resolution;
  readonly out: string;
  /** The mastered soundtrack (`audio.wav`), muxed in as AAC; without it the video is silent. */
  readonly audio?: string;
}): string[] => {
  const scale = scaleTo(resolution);
  return [
    ["-y", "-loglevel", "error"],
    ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"],
    audio ? ["-i", audio, "-map", "0:v", "-map", "1:a"] : [],
    scale,
    ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"],
    audio ? ["-c:a", "aac", "-b:a", "192k"] : [],
    ["-r", String(fps), "-movflags", "+faststart", out],
  ].flat();
};

/** ffmpeg arguments that read one PNG frame from stdin and write it to `out`, scaled like the video. */
export const posterArgs = ({
  resolution,
  out,
}: {
  readonly resolution: Resolution;
  readonly out: string;
}): string[] => [
  ...["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "png", "-i", "-"],
  ...scaleTo(resolution),
  ...["-frames:v", "1", out],
];
