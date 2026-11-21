import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VoiceConfig } from "../schema/config.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import type { TtsProvider } from "./tts.ts";
import { decodeWav, encodeWav } from "./wav.ts";

/** One narration line, spoken: where its audio is and how long it lasts. */
export type VoiceLine = {
  readonly scene: string;
  readonly beat: string;
  readonly file: string;
  readonly seconds: number;
  /** Whether it came from the cache rather than the provider. */
  readonly cached: boolean;
};

export type VoiceOptions = {
  /** The project's folder; lines go in its `cache/tts/`. */
  readonly projectDir: string;
  readonly storyboard: Storyboard;
  readonly voice: VoiceConfig;
  readonly tts: TtsProvider;
  /** Read the lines already cached and skip the rest, generating nothing. */
  readonly onlyCached?: boolean;
};

/** A line's file name: a hash of everything that changes how it sounds (SPEC, Project folder). */
const lineKey = (tts: TtsProvider, text: string, voice: VoiceConfig): string =>
  createHash("sha256")
    .update(JSON.stringify([tts.id, voice.id, voice.speed, text]))
    .digest("hex")
    .slice(0, 32);

/** A cached line's length, or undefined when the file is missing or not a WAV it wrote. */
const cachedSeconds = async (file: string): Promise<number | undefined> => {
  const bytes = await readFile(file).catch(() => undefined);
  if (!bytes) return undefined;
  const wav = decodeWav(bytes, file);
  return wav.ok ? wav.value.seconds : undefined;
};

/**
 * Speaks every beat's narration that is not cached yet, one line at a time,
 * and returns every line in storyboard order. Editing one line regenerates
 * only that line. Lines no longer in the storyboard are left in the cache.
 */
export const generateVoice = async ({
  projectDir,
  storyboard,
  voice,
  tts,
  onlyCached = false,
}: VoiceOptions): Promise<VoiceLine[]> => {
  if (!voice.enabled) return [];
  const dir = join(projectDir, "cache", "tts");
  await mkdir(dir, { recursive: true });
  const lines: VoiceLine[] = [];
  for (const scene of storyboard.scenes)
    for (const beat of scene.beats) {
      if (!beat.say) continue;
      const file = join(dir, `${lineKey(tts, beat.say, voice)}.wav`);
      const where = { scene: scene.id, beat: beat.id, file };
      const seconds = await cachedSeconds(file);
      if (seconds !== undefined) {
        lines.push({ ...where, seconds, cached: true });
        continue;
      }
      if (onlyCached) continue;
      const audio = await tts.generate(beat.say, { voice: voice.id, speed: voice.speed });
      // Written whole, then renamed: a line half written by a crash never reads as cached,
      // and two runs at once each write their own file.
      const partial = `${file}.${randomUUID()}.partial`;
      await writeFile(partial, encodeWav(audio));
      await rename(partial, file);
      lines.push({ ...where, seconds: audio.samples.length / audio.sampleRate, cached: false });
    }
  return lines;
};

/** Each spoken beat's measured length, for the beat builder. */
export const narrationLengths = (lines: readonly VoiceLine[]): Narration =>
  Object.fromEntries(lines.map((line) => [line.beat, line.seconds]));
