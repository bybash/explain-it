import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TtsProvider } from "../audio/tts.ts";
import { narrationLengths, readCachedVoice, type VoiceLine } from "../audio/voice.ts";
import { type RunChecks, skippedChecks } from "../render/check.ts";
import { CHECK_REPORT, checkedFilesKey } from "../render/check-files.ts";
import type { MissingTool } from "../render/environment.ts";
import { loadProject } from "../render/load.ts";
import type { ChecksRun, PreviewChecks, PreviewSound } from "../schema/api.ts";
import { CheckReportSchema, type SkippedChecks } from "../schema/checks.ts";
import { formatErrors, parseWith, type Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import type { Events } from "./events.ts";
import type { PreviewSoundJobs } from "./preview-sound.ts";
import { projectDir } from "./projects.ts";

/** A run of a project's checks: how far it is, how to stop it, and when it ends. */
type Job = { status: ChecksRun; readonly stop: AbortController; finished: Promise<void> };

/** How often the checks wait for the sound again when the files change under them. */
const SOUND_TRIES = 3;

/** What the checks take from the sound: the voice's lines, the soundtrack to measure, and what to skip. */
type SoundForChecks = {
  readonly lines: readonly VoiceLine[];
  readonly soundtrack: string | null;
  readonly skip: readonly SkippedChecks[];
};

/** `promise`, or a rejection as soon as `signal` stops the run. */
const untilStopped = <T>(signal: AbortSignal, promise: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const stopped = () => reject(new Error("the checks were stopped"));
    if (signal.aborted) return stopped();
    signal.addEventListener("abort", stopped, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", stopped));
  });

/**
 * The checks from the Preview gate (SPEC, Checks): they wait for the
 * preview's sound, so they are timed by its voice and measure its
 * soundtrack, then run as `explain-it check` does and write `checks.json`
 * and the contact sheet. Each step is told as a `preview-checks` event. A
 * newer run for a project stops the older, and starts once it has ended, so
 * two never write the report at once.
 */
export const previewChecks = ({
  projectsDir,
  sound,
  tts,
  run,
  missingTools,
  events,
}: {
  readonly projectsDir: string;
  readonly sound: PreviewSoundJobs;
  readonly tts: TtsProvider;
  /** Runs the checks and writes the report: the real ones in the app, a fake in tests. */
  readonly run: RunChecks;
  readonly missingTools: () => Promise<readonly MissingTool[]>;
  readonly events: Events;
}) => {
  const jobs = new Map<string, Job>();

  const report = (slug: string, job: Job, status: ChecksRun) => {
    if (jobs.get(slug) !== job) return;
    job.status = status;
    events.publish({ type: "preview-checks", slug, state: status.state });
  };

  /** The voice, the soundtrack and the skipped checks, from the sound as it settled. */
  const soundForChecks = async (
    slug: string,
    settled: PreviewSound,
    voice: Parameters<typeof readCachedVoice>[0],
  ): Promise<SoundForChecks> => {
    const lines = voice.voice.enabled ? await readCachedVoice(voice) : [];
    const failed = settled.state === "failed" ? settled : undefined;
    const skip = skippedChecks(await missingTools(), {
      voiceFailed: failed?.step === "voice",
      ...(failed?.step === "mix" ? { mixFailed: failed.message } : {}),
    });
    const soundtrack = settled.state === "ready" ? sound.file(slug, settled.key) : null;
    // Ready, but replaced since by a newer sound: there is no soundtrack left to measure.
    if (soundtrack === undefined)
      return {
        lines,
        soundtrack: null,
        skip: [...skip, { checks: ["loudness"], reason: "the sound changed during the checks" }],
      };
    return { lines, soundtrack, skip };
  };

  /**
   * The project's files with the sound settled for them: an edit while the
   * checks wait makes the sound again, and the checks wait for that one, so
   * the voice and the files they check always agree.
   */
  const settledProject = async (slug: string, signal: AbortSignal) => {
    const dir = projectDir(projectsDir, slug);
    for (let tries = 1; ; tries++) {
      const { key, status } = await untilStopped(signal, sound.settled(slug));
      const loaded = await loadProject(dir);
      if (!loaded.ok) return loaded;
      if (key === sound.keyOf(loaded.value)) return ok({ project: loaded.value, status });
      if (tries === SOUND_TRIES)
        return fail([{ path: "files", message: "they kept changing: run the checks again" }]);
      const asked = await sound.start(slug);
      if (!asked?.ok) return asked ?? fail([{ path: "slug", message: "the project is gone" }]);
    }
  };

  const check = async (slug: string, job: Job, after: Promise<void> | undefined) => {
    const signal = job.stop.signal;
    try {
      await after;
      if (signal.aborted) return;
      report(slug, job, { state: "waiting" });
      const settled = await settledProject(slug, signal);
      if (!settled.ok)
        return report(slug, job, {
          state: "failed",
          message: formatErrors(settled.errors).join("; "),
        });
      const { project, status } = settled.value;
      const dir = projectDir(projectsDir, slug);
      const heard = await soundForChecks(slug, status, {
        projectDir: dir,
        storyboard: project.storyboard,
        voice: project.config.voice,
        tts,
      });
      if (signal.aborted) return;
      report(slug, job, { state: "checking", checked: 0, total: 0 });
      await run({
        dir,
        project: { ...project, narration: narrationLengths(heard.lines) },
        lines: heard.lines,
        skip: heard.skip,
        soundtrack: heard.soundtrack,
        signal,
        onProgress: (checked, total) => report(slug, job, { state: "checking", checked, total }),
      });
      report(slug, job, { state: "done" });
    } catch (error) {
      if (signal.aborted) return;
      report(slug, job, {
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** The last report, when there is one that reads. */
  const readReport = async (slug: string) => {
    const text = await readFile(join(projectDir(projectsDir, slug), CHECK_REPORT), "utf8").catch(
      () => undefined,
    );
    if (text === undefined) return null;
    try {
      const parsed = parseWith(CheckReportSchema, JSON.parse(text));
      return parsed.ok ? parsed.value : null;
    } catch {
      return null;
    }
  };

  return {
    /**
     * Starts the checks, stopping a run already under way; asks for the
     * preview's sound first, so it is made when it is not yet. Undefined for
     * a project that does not exist; errors when it lacks what the preview
     * plays.
     */
    start: async (slug: string): Promise<Validated<ChecksRun> | undefined> => {
      const asked = await sound.start(slug);
      if (!asked?.ok) return asked;
      const older = jobs.get(slug);
      older?.stop.abort();
      const stop = new AbortController();
      const job: Job = { status: { state: "waiting" }, stop, finished: Promise.resolve() };
      jobs.set(slug, job);
      // The older run ends before this one starts, so they never write the report together.
      job.finished = check(slug, job, older?.finished);
      return ok(job.status);
    },

    /** The run under way, the last report, and whether the files are still the ones it checked. */
    status: async (slug: string): Promise<PreviewChecks> => {
      const run = jobs.get(slug)?.status ?? { state: "idle" };
      const lastReport = await readReport(slug);
      if (!lastReport) return { run, report: null, upToDate: false };
      const loaded = await loadProject(projectDir(projectsDir, slug));
      const upToDate = loaded.ok && lastReport.filesKey === checkedFilesKey(loaded.value);
      return { run, report: lastReport, upToDate };
    },
  };
};

export type PreviewChecksJobs = ReturnType<typeof previewChecks>;
