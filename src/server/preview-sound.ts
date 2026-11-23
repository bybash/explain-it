import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { makeSoundtrack, SoundtrackProject } from "../audio/soundtrack.ts";
import type { TtsProvider } from "../audio/tts.ts";
import { generateVoice, narrationLengths, readCachedVoice } from "../audio/voice.ts";
import { beatOptions } from "../engine/beats/build.ts";
import type { MissingTool } from "../render/environment.ts";
import { type OpenedProject, PREVIEW_KEY_LENGTH, type PreviewSound } from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import type { Events } from "./events.ts";
import { openProject, projectDir } from "./projects.ts";

/**
 * Bumped when the voice's or the mix's code changes what a soundtrack sounds
 * like, so soundtracks made before are made again.
 */
const SOUND_VERSION = 1;

/** A project's sound in the making, or made: which files it is for, and how far it is. */
type Job = {
  readonly key: string;
  status: PreviewSound;
  readonly stop: AbortController;
  /** Settles when the job stops making the sound: made, failed or stopped. */
  finished: Promise<void>;
};

/** The files the preview needs that the project lacks, each named with why. */
const missingFiles = (opened: OpenedProject): ValidationError[] =>
  (["graph.json", "storyboard.json", "layout.json"] as const).flatMap((file) => {
    const present = {
      "graph.json": opened.graph,
      "storyboard.json": opened.storyboard,
      "layout.json": opened.layout,
    }[file];
    if (present) return [];
    const problem = opened.problems.find((p) => p.path.startsWith(file));
    return [
      {
        path: file,
        message:
          problem?.message ?? "missing: the preview needs the graph, the script and the layout",
      },
    ];
  });

/**
 * What the sound follows, and nothing else, so a palette or a font changed
 * does not make it again: the voice model and the mix's version, the graph
 * and the script, the voice and the music, and what times the beats.
 */
const soundKey = (tts: TtsProvider, project: SoundtrackProject): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        SOUND_VERSION,
        tts.id,
        project.graph,
        project.storyboard,
        project.config.voice,
        project.config.music,
        beatOptions(project.config),
      ]),
    )
    .digest("hex")
    .slice(0, PREVIEW_KEY_LENGTH);

/**
 * The preview gate's sound (SPEC, User flow): the voice spoken for every
 * line not cached yet, with progress, then the soundtrack mixed as the
 * render mixes it, into `cache/preview/<key>.wav`. The key is a hash of what
 * the sound follows, so nothing is made twice, and a change to the script or
 * the sound makes it again, speaking only the lines that changed; the older
 * soundtrack is then removed. Each step is told to listeners as a
 * `preview-sound` event; a newer request for a project stops the older one.
 */
export const previewSound = ({
  projectsDir,
  tts,
  mix,
  missingTools,
  events,
}: {
  readonly projectsDir: string;
  readonly tts: TtsProvider;
  /** Mixes the soundtrack: the render's (ffmpeg masters it), or a fake in tests. */
  readonly mix: typeof makeSoundtrack;
  /** What the mix needs and this machine lacks; ffmpeg is named before mixing. */
  readonly missingTools: () => Promise<readonly MissingTool[]>;
  readonly events: Events;
}) => {
  const jobs = new Map<string, Job>();
  const soundDir = (slug: string) => join(projectDir(projectsDir, slug), "cache", "preview");
  const soundFile = (slug: string, key: string) => join(soundDir(slug), `${key}.wav`);

  /** Sets the job's status and tells listeners, unless a newer job has taken its place. */
  const report = (slug: string, job: Job, status: PreviewSound) => {
    if (jobs.get(slug) !== job) return;
    job.status = status;
    events.publish({ type: "preview-sound", slug, state: status.state });
  };

  const makeSound = async (slug: string, job: Job, project: SoundtrackProject) => {
    const signal = job.stop.signal;
    let step: "voice" | "mix" = "voice";
    try {
      const lines = await generateVoice({
        projectDir: projectDir(projectsDir, slug),
        storyboard: project.storyboard,
        voice: project.config.voice,
        tts,
        signal,
        onProgress: (spoken, total) => report(slug, job, { state: "speaking", spoken, total }),
      });
      const ffmpeg = (await missingTools()).find((m) => m.tool === "ffmpeg");
      step = "mix";
      if (ffmpeg) return report(slug, job, { state: "failed", step, message: ffmpeg.message });
      report(slug, job, { state: "mixing" });
      const narration = narrationLengths(lines);
      await mkdir(soundDir(slug), { recursive: true });
      // Mixed into a file of its own, then renamed: a mix cut short is never taken as made.
      const partial = join(soundDir(slug), `${job.key}.${randomUUID()}.partial.wav`);
      try {
        const mixed = await mix({
          project: { ...project, narration },
          lines,
          out: partial,
          signal,
        });
        if (!mixed) return report(slug, job, { state: "silent" });
        await rename(partial, soundFile(slug, job.key));
      } finally {
        await rm(partial, { force: true });
      }
      // The older soundtracks follow files that have changed since.
      for (const old of await readdir(soundDir(slug)))
        if (old !== `${job.key}.wav` && !old.includes(".partial."))
          await rm(join(soundDir(slug), old), { force: true });
      report(slug, job, { state: "ready", key: job.key, narration });
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      report(slug, job, { state: "failed", step, message });
    }
  };

  return {
    /**
     * Starts making the project's sound, unless it is made or being made
     * for the same files; answers how far it is. Undefined for a project
     * that does not exist; errors when it lacks what the preview plays.
     */
    start: async (slug: string): Promise<Validated<PreviewSound> | undefined> => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return undefined;
      if (!opened.ok) return opened;
      const missing = missingFiles(opened.value);
      const { graph, storyboard } = opened.value;
      if (missing.length > 0 || !graph || !storyboard) return fail(missing);
      const project: SoundtrackProject = {
        graph,
        storyboard,
        config: opened.value.config ?? DEFAULT_CONFIG,
      };
      const key = soundKey(tts, project);
      const current = jobs.get(slug);
      if (current?.key === key && current.status.state !== "failed") return ok(current.status);
      current?.stop.abort();

      const job: Job = {
        key,
        status: { state: "idle" },
        stop: new AbortController(),
        finished: Promise.resolve(),
      };
      jobs.set(slug, job);
      if (existsSync(soundFile(slug, key))) {
        const lines = await readCachedVoice({
          projectDir: projectDir(projectsDir, slug),
          storyboard,
          voice: project.config.voice,
          tts,
        });
        job.status = { state: "ready", key, narration: narrationLengths(lines) };
        return ok(job.status);
      }
      job.status = { state: "speaking", spoken: 0, total: 0 };
      job.finished = makeSound(slug, job, project);
      return ok(job.status);
    },

    /**
     * The project's sound once it is no longer being made: ready, silent or
     * failed, or idle when nothing was asked for. A newer job that takes the
     * older's place while waiting is waited for in turn.
     */
    settled: async (slug: string): Promise<PreviewSound> => {
      for (;;) {
        const job = jobs.get(slug);
        if (!job) return { state: "idle" };
        await job.finished;
        if (jobs.get(slug) === job) return job.status;
      }
    },

    /** How far the project's sound is; idle when nothing was asked for yet. */
    status: (slug: string): PreviewSound => jobs.get(slug)?.status ?? { state: "idle" },

    /** The soundtrack's file, when it is ready for `key`. */
    file: (slug: string, key: string): string | undefined => {
      const job = jobs.get(slug);
      return job?.status.state === "ready" && job.key === key ? soundFile(slug, key) : undefined;
    },
  };
};

export type PreviewSoundJobs = ReturnType<typeof previewSound>;
