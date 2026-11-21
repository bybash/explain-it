import { DEFAULT_CONFIG, MUSIC_MOODS, type MusicMood, MusicSeedSchema } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** `npm run music -- <mood> <seconds> <out.wav> [--seed n]` */
export type MusicArgs = {
  readonly mood: MusicMood;
  readonly seconds: number;
  readonly out: string;
  readonly seed: number;
};

/** A sample long enough to hear a mood, short enough to make in seconds; renders use the video's length. */
const SAMPLE_SECONDS = { min: 1, max: 600 } as const;

export const MUSIC_USAGE = `usage: npm run music -- <${MUSIC_MOODS.join("|")}> <seconds> <out.wav> [--seed n]`;

const isMood = (value: string): value is MusicMood =>
  (MUSIC_MOODS as readonly string[]).includes(value);

/** Reads the music command's arguments; every problem names the argument it is about. */
export const parseMusicArgs = (argv: readonly string[]): Validated<MusicArgs> => {
  const errors: ValidationError[] = [];
  const positional: string[] = [];
  let seedText: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [flag = "", inline] = arg.split(/=(.*)/s);
    if (flag !== "--seed") {
      errors.push({ path: flag, message: "unknown option" });
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      errors.push({ path: "--seed", message: "needs a value" });
      if (value?.startsWith("--")) i--;
      continue;
    }
    seedText = value;
  }
  const [mood, secondsText, out] = positional;
  const required = (path: string) => errors.push({ path, message: "required" });

  if (mood === undefined) required("<mood>");
  else if (!isMood(mood))
    errors.push({
      path: "<mood>",
      message: `must be one of ${MUSIC_MOODS.map((m) => JSON.stringify(m)).join(", ")}`,
    });
  const seconds = Number(secondsText);
  if (secondsText === undefined) required("<seconds>");
  else if (
    !Number.isFinite(seconds) ||
    seconds < SAMPLE_SECONDS.min ||
    seconds > SAMPLE_SECONDS.max
  )
    errors.push({
      path: "<seconds>",
      message: `must be a number of seconds from ${SAMPLE_SECONDS.min} to ${SAMPLE_SECONDS.max}`,
    });
  if (out === undefined) required("<out.wav>");
  else if (!out.endsWith(".wav")) errors.push({ path: "<out.wav>", message: "must end in .wav" });
  // The seed is checked by the config's own schema, so the command and config.json agree.
  const seed =
    seedText === undefined
      ? DEFAULT_CONFIG.music.seed
      : MusicSeedSchema.safeParse(Number(seedText));
  if (typeof seed !== "number" && !seed.success)
    errors.push({ path: "--seed", message: "must be a whole number from 0" });
  for (const extra of positional.slice(3))
    errors.push({ path: extra, message: "unexpected argument" });

  if (errors.length > 0 || mood === undefined || !isMood(mood) || out === undefined)
    return fail(errors);
  return ok({ mood, seconds, out, seed: typeof seed === "number" ? seed : (seed.data ?? 0) });
};
