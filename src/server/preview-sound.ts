import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { makeSoundtrack } from "../audio/soundtrack.ts";
import type { TtsProvider } from "../audio/tts.ts";
import { generateVoice, narrationLengths, readCachedVoice } from "../audio/voice.ts";
import type { PreviewSound } from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import type { Events } from "./events.ts";
import { openProject, projectDir } from "./projects.ts";

/** A project's sound in the making, or made: which files it is for, and how far it is. */
type Job = { key: string; status: PreviewSound; readonly stop: AbortController };

/**
 * The preview gate's sound (SPEC, User flow): the voice spoken for every
 * line not cached yet, with progress, then the soundtrack mixed as the
 * render mixes it, into `cache/preview/<key>.wav`. The key is a hash of the
 * voice model and the files the sound follows, so nothing is made twice,
 * and a change to the script or the style makes it again, speaking only the
 * lines that changed. Each step is told to listeners as a `preview-sound`
 * event; a newer request for a project stops the older one.
 */
export const previewSound = ({
  projectsDir,
  tts,
  mix,
  events,
}: {
  readonly projectsDir: string;
  readonly tts: TtsProvider;
  /** Mixes the soundtrack: the render's (ffmpeg masters it), or a fake in tests. */
  readonly mix: typeof makeSoundtrack;
  readonly events: Events;
}) => {
  const jobs = new Map<string, Job>();
  const soundFile = (slug: string, key: string) =>
    join(projectDir(projectsDir, slug), "cache", "preview", `${key}.wav`);

  const tell = (slug: string, job: Job, status: PreviewSound) => {
    if (jobs.get(slug) !== job) return;
    job.status = status;
    events.publish({ type: "preview-sound", slug, state: status.state });
  };

  const make = async (slug: string, job: Job, project: Parameters<typeof mix>[0]["project"]) => {
    const dir = projectDir(projectsDir, slug);
    const signal = job.stop.signal;
    try {
      const lines = await generateVoice({
        projectDir: dir,
        storyboard: project.storyboard,
        voice: project.config.voice,
        tts,
        signal,
        onProgress: (spoken, total) => tell(slug, job, { state: "speaking", spoken, total }),
      });
      tell(slug, job, { state: "mixing" });
      const narration = narrationLengths(lines);
      const out = soundFile(slug, job.key);
      await mkdir(join(dir, "cache", "preview"), { recursive: true });
      const mixed = await mix({ project: { ...project, narration }, lines, out, signal });
      tell(slug, job, mixed ? { state: "ready", key: job.key, narration } : { state: "silent" });
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      tell(slug, job, { state: "failed", message });
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
      const { graph, storyboard, layout, problems } = opened.value;
      const config = opened.value.config ?? DEFAULT_CONFIG;
      const missing = (
        [
          ["graph.json", graph],
          ["storyboard.json", storyboard],
          ["layout.json", layout],
        ] as const
      ).filter(([, file]) => file === null);
      if (missing.length > 0 || !graph || !storyboard || !layout)
        return fail(
          missing.map(([file]) => ({
            path: file,
            message:
              problems.find((p) => p.path.startsWith(file))?.message ??
              "missing: the preview needs the graph, the script and the layout",
          })),
        );
      const key = createHash("sha256")
        .update(JSON.stringify([tts.id, graph, storyboard, config]))
        .digest("hex")
        .slice(0, 32);
      const current = jobs.get(slug);
      if (current?.key === key && current.status.state !== "failed") return ok(current.status);
      current?.stop.abort();

      const job: Job = { key, status: { state: "idle" }, stop: new AbortController() };
      jobs.set(slug, job);
      const project = { graph, storyboard, config };
      if (existsSync(soundFile(slug, key))) {
        const lines = await readCachedVoice({
          projectDir: projectDir(projectsDir, slug),
          storyboard,
          voice: config.voice,
          tts,
        });
        job.status = { state: "ready", key, narration: narrationLengths(lines) };
        return ok(job.status);
      }
      job.status = { state: "speaking", spoken: 0, total: 0 };
      void make(slug, job, project);
      return ok(job.status);
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
