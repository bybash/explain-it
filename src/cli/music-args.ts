import { DEFAULT_CONFIG, MUSIC_MOODS } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

type MusicMood = (typeof MUSIC_MOODS)[number];

/** `npm run music -- <mood> <seconds> <out.wav> [--seed n]` */
export type MusicArgs = {
  readonly mood: MusicMood;
  readonly seconds: number;
  readonly out: string;
  readonly seed: number;
};

/** Long enough for any video; short enough to make in a few seconds. */
const MAX_SECONDS = 600;

const isMood = (value: string): value is MusicMood =>
  (MUSIC_MOODS as readonly string[]).includes(value);

/** Reads the music command's arguments; every problem names the argument it is about. */
export const parseMusicArgs = (argv: readonly string[]): Validated<MusicArgs> => {
  const errors: ValidationError[] = [];
  const positional: string[] = [];
  let seedText: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) positional.push(arg);
    else if (arg === "--seed") seedText = argv[++i] ?? "";
    else if (arg.startsWith("--seed=")) seedText = arg.slice("--seed=".length);
    else errors.push({ path: arg, message: "unknown option" });
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
  else if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_SECONDS)
    errors.push({
      path: "<seconds>",
      message: `must be a number of seconds from 1 to ${MAX_SECONDS}`,
    });
  if (out === undefined) required("<out.wav>");
  else if (!out.endsWith(".wav")) errors.push({ path: "<out.wav>", message: "must end in .wav" });
  const seed = seedText === undefined ? DEFAULT_CONFIG.music.seed : Number(seedText);
  if (!Number.isInteger(seed) || seed < 0)
    errors.push({ path: "--seed", message: "must be a whole number from 0" });
  for (const extra of positional.slice(3))
    errors.push({ path: extra, message: "unexpected argument" });

  if (errors.length > 0 || mood === undefined || !isMood(mood) || out === undefined)
    return fail(errors);
  return ok({ mood, seconds, out, seed });
};
