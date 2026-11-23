import { writeFile } from "node:fs/promises";
import type { makeSoundtrack } from "./soundtrack.ts";
import { encodeWav } from "./wav.ts";

/**
 * Mixes as the render does, without ffmpeg: a second of silence, or nothing
 * for a video with no sound at all. It counts its mixes, and fails each one
 * after writing part of the file when given a message.
 */
export const fakeMix = ({ failWith }: { failWith?: string } = {}) => {
  const mixes: string[] = [];
  const mix: typeof makeSoundtrack = async ({ project, lines, out }) => {
    if (lines.length === 0 && !project.config.music.enabled) return undefined;
    mixes.push(out);
    await writeFile(out, encodeWav({ samples: new Float32Array(48_000), sampleRate: 48_000 }));
    if (failWith) throw new Error(failWith);
    return out;
  };
  return { mix, mixes };
};
