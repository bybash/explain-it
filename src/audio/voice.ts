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

/** Where a line's audio is kept in a project's cache. */
const lineFile = (projectDir: string, tts: TtsProvider, text: string, voice: VoiceConfig) =>
  join(projectDir, "cache", "tts", `${lineKey(tts, text, voice)}.wav`);

/** Every spoken line in storyboard order, with the file its audio has, or would have. */
const spokenLines = ({ projectDir, storyboard, voice, tts }: VoiceOptions) => {
  if (!voice.enabled) return [];
  return storyboard.scenes.flatMap((scene) =>
    scene.beats.flatMap((beat) =>
      beat.say
        ? [
            {
              scene: scene.id,
              beat: beat.id,
              say: beat.say,
              file: lineFile(projectDir, tts, beat.say, voice),
            },
          ]
        : [],
    ),
  );
};

/**
 * Speaks every beat's narration that is not cached yet, one line at a time,
 * and returns every line in storyboard order. Editing one line regenerates
 * only that line. Lines no longer in the storyboard are left in the cache.
 * When `signal` aborts, it stops before the next line.
 */
export const generateVoice = async (
  options: VoiceOptions & { readonly signal?: AbortSignal },
): Promise<VoiceLine[]> => {
  const { voice, tts, signal } = options;
  const wanted = spokenLines(options);
  if (wanted.length === 0) return [];
  const lines: VoiceLine[] = [];
  for (const { say, scene, beat } of wanted) {
    signal?.throwIfAborted();
    const spoken = await speakLine({ projectDir: options.projectDir, text: say, voice, tts });
    lines.push({ scene, beat, ...spoken });
  }
  signal?.throwIfAborted();
  return lines;
};

/** One spoken line: its file in the cache, its length, and whether it was there already. */
export type SpokenLine = Pick<VoiceLine, "file" | "seconds" | "cached">;

/**
 * Speaks one line into the project's `cache/tts/`, or reads it from there
 * when it was spoken before in the same voice and speed. The video's lines
 * and the style gate's sample share this cache, so a sample heard is not
 * spoken again for the render.
 */
export const speakLine = async ({
  projectDir,
  text,
  voice,
  tts,
}: {
  readonly projectDir: string;
  readonly text: string;
  readonly voice: VoiceConfig;
  readonly tts: TtsProvider;
}): Promise<SpokenLine> => {
  const file = lineFile(projectDir, tts, text, voice);
  const seconds = await cachedSeconds(file);
  if (seconds !== undefined) return { file, seconds, cached: true };
  await mkdir(join(projectDir, "cache", "tts"), { recursive: true });
  const audio = await tts.generate(text, { voice: voice.id, speed: voice.speed });
  // Written whole, then renamed: a line half written by a crash never reads as cached,
  // and two runs at once each write their own file.
  const partial = `${file}.${randomUUID()}.partial`;
  await writeFile(partial, encodeWav(audio));
  await rename(partial, file);
  return { file, seconds: audio.samples.length / audio.sampleRate, cached: false };
};

/** The spoken lines already in the cache, in storyboard order; generates and creates nothing. */
export const readCachedVoice = async (options: VoiceOptions): Promise<VoiceLine[]> => {
  const lines: VoiceLine[] = [];
  for (const { say: _say, ...where } of spokenLines(options)) {
    const seconds = await cachedSeconds(where.file);
    if (seconds !== undefined) lines.push({ ...where, seconds, cached: true });
  }
  return lines;
};

/** Each spoken beat's measured length, for the beat builder. */
export const narrationLengths = (lines: readonly VoiceLine[]): Narration =>
  Object.fromEntries(lines.map((line) => [line.beat, line.seconds]));

/** What to do when the voice cannot be made: a render needs it while it is on. */
export const VOICE_OFF_HINT = "Turn the voice off (voice.enabled: false) to render without it";
