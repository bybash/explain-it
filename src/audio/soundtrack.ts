import { readFile } from "node:fs/promises";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { LEAD_IN } from "../engine/beats/timing.ts";
import type { Config } from "../schema/config.ts";
import type { Graph } from "../schema/graph.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { masterAudio } from "./master.ts";
import { mixAudio, type PlacedLine } from "./mix.ts";
import { musicPlan, renderMusic } from "./music.ts";
import type { VoiceLine } from "./voice.ts";
import { decodeWav } from "./wav.ts";

/** What the soundtrack follows: the files the video is built from, and its measured narration. */
export type SoundtrackProject = {
  readonly storyboard: Storyboard;
  readonly graph: Graph;
  readonly config: Config;
  readonly narration?: Narration;
};

/** Where each voice line starts: its beat's start plus the lead-in, from the plan the video plays. */
export const linePlacements = (
  project: SoundtrackProject,
  lines: readonly VoiceLine[],
): { readonly at: number; readonly file: string }[] => {
  const plan = buildBeats(
    project.storyboard,
    project.graph,
    beatOptions(project.config, project.narration),
  );
  const starts = new Map(plan.beats.map((beat) => [beat.id, beat.start + LEAD_IN]));
  return lines.flatMap((line) => {
    const at = starts.get(line.beat);
    return at === undefined ? [] : [{ at, file: line.file }];
  });
};

/**
 * The video's soundtrack, written to `out`: every voice line at its beat,
 * the music under it when it is on, ducked while the voice speaks, and the
 * whole mastered to −16 LUFS. Returns `out`, or undefined when the video
 * has neither voice nor music.
 */
export const makeSoundtrack = async ({
  project,
  lines,
  out,
}: {
  readonly project: SoundtrackProject;
  readonly lines: readonly VoiceLine[];
  readonly out: string;
}): Promise<string | undefined> => {
  const { duration } = buildBeats(
    project.storyboard,
    project.graph,
    beatOptions(project.config, project.narration),
  );
  const placed: PlacedLine[] = await Promise.all(
    linePlacements(project, lines).map(async ({ at, file }) => {
      const wav = decodeWav(await readFile(file), file);
      if (!wav.ok) throw new Error(`a voice line is not readable: ${file}`);
      return { at, audio: wav.value };
    }),
  );
  const { music } = project.config;
  const mix = mixAudio({
    seconds: duration,
    lines: placed,
    ...(music.enabled
      ? { music: renderMusic(musicPlan({ mood: music.mood, seed: music.seed, seconds: duration })) }
      : {}),
    volumeDb: music.volumeDb,
  });
  if (!mix) return undefined;
  await masterAudio(mix, out);
  return out;
};
