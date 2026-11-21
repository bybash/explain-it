// Makes a piece of the background music and writes it as a WAV, to hear a
// mood. Usage: see MUSIC_USAGE in src/cli/music-args.ts.
import { writeFileSync } from "node:fs";
import { musicPlan, renderMusic } from "../src/audio/music.ts";
import { encodeWav } from "../src/audio/wav.ts";
import { MUSIC_USAGE, parseMusicArgs } from "../src/cli/music-args.ts";
import { formatErrors } from "../src/schema/errors.ts";

const args = parseMusicArgs(process.argv.slice(2));
if (!args.ok) {
  for (const line of formatErrors(args.errors)) console.error(line);
  console.error(MUSIC_USAGE);
  process.exit(2);
}
const { mood, seconds, out, seed } = args.value;
writeFileSync(out, encodeWav(renderMusic(musicPlan({ mood, seed, seconds }))));
console.log(`${mood}, seed ${seed}, ${seconds} s: ${out}`);
