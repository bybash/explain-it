import type { Validated } from "../schema/errors.ts";
import type {
  RenderedTheme,
  RenderJob,
  RenderProgress,
  RenderRequest,
  RenderState,
} from "../schema/render.ts";
import { fail, ok } from "../schema/result.ts";
import type { RenderControl } from "./render.ts";

/** Renders one request, reporting progress, and stops when `signal` aborts. */
export type RenderRun = (
  request: RenderRequest,
  control: Required<RenderControl>,
) => Promise<readonly RenderedTheme[]>;

/** How much of the whole job is done: each theme counts the same, in whole percent. */
const percentOf = ({ done, total, themeIndex, themes }: RenderProgress): number =>
  Math.floor(((themeIndex + (total > 0 ? done / total : 0)) / themes) * 100);

export type RenderQueueOptions = {
  readonly run: RenderRun;
  readonly now: () => Date;
  readonly newId?: () => string;
  /** Called with the job each time it changes, for the event stream. */
  readonly onChange?: (job: RenderJob) => void;
};

/**
 * The render jobs, run one at a time in the order they came (SPEC,
 * Rendering): one render already fills the machine. Jobs are kept in memory
 * for the life of the server; their files stay in the project's out/.
 */
export class RenderQueue {
  readonly #options: RenderQueueOptions;
  readonly #jobs = new Map<string, RenderJob>();
  readonly #waiting: string[] = [];
  #running: { readonly id: string; readonly controller: AbortController } | undefined;

  constructor(options: RenderQueueOptions) {
    this.#options = options;
  }

  /** Queues a render and returns its job; it starts when the jobs before it are done. */
  add(request: RenderRequest): RenderJob {
    const id = this.#options.newId?.() ?? crypto.randomUUID();
    this.#update({
      id,
      slug: request.slug,
      state: "queued",
      request,
      createdAt: this.#options.now().toISOString(),
    });
    this.#waiting.push(id);
    queueMicrotask(() => this.#next());
    return this.#jobs.get(id) as RenderJob;
  }

  get(id: string): RenderJob | undefined {
    return this.#jobs.get(id);
  }

  /** Every job, the newest first. */
  list(): RenderJob[] {
    return [...this.#jobs.values()].reverse();
  }

  /** Stops a queued or running job; a running one ends once its render has stopped. */
  cancel(id: string): Validated<RenderJob> {
    const job = this.#jobs.get(id);
    if (!job) return fail([{ path: "job", message: `no render job "${id}"` }]);
    if (job.state === "queued") {
      this.#waiting.splice(this.#waiting.indexOf(id), 1);
      return ok(this.#finish(job, { state: "cancelled" }));
    }
    if (job.state === "running" && this.#running?.id === id) {
      this.#running.controller.abort(new Error("cancelled"));
      return ok(job);
    }
    return fail([
      {
        path: "job",
        message: `job "${id}" is ${job.state}; only a queued or running job can be cancelled`,
      },
    ]);
  }

  #update(job: RenderJob): RenderJob {
    this.#jobs.set(job.id, job);
    try {
      this.#options.onChange?.(job);
    } catch {
      // A listener that fails must not stop the queue; the job is recorded either way.
    }
    return job;
  }

  /** Ends a job: what it was doing is over, so only its end is kept. */
  #finish(job: RenderJob, end: Partial<RenderJob> & { state: RenderState }): RenderJob {
    const { step: _step, ...ended } = job;
    return this.#update({ ...ended, ...end, finishedAt: this.#options.now().toISOString() });
  }

  async #next(): Promise<void> {
    if (this.#running) return;
    const id = this.#waiting.shift();
    const job = id === undefined ? undefined : this.#jobs.get(id);
    if (!job) return;
    const controller = new AbortController();
    this.#running = { id: job.id, controller };
    let current = this.#update({
      ...job,
      state: "running",
      startedAt: this.#options.now().toISOString(),
    });
    try {
      const outputs = await this.#options.run(job.request, {
        signal: controller.signal,
        onProgress: (progress) => {
          current = this.#update({
            ...current,
            progress: { ...progress, percent: percentOf(progress) },
          });
        },
        onStep: (step) => {
          current = this.#update({ ...current, step });
        },
        onFolder: (stamp) => {
          current = this.#update({ ...current, stamp });
        },
      });
      // A cancel that came after the render's last look at the signal still wins: the caller was told it would stop.
      this.#finish(
        current,
        controller.signal.aborted
          ? { state: "cancelled" }
          : { state: "done", outputs: [...outputs] },
      );
    } catch (error) {
      this.#finish(
        current,
        controller.signal.aborted
          ? { state: "cancelled" }
          : { state: "failed", error: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      this.#running = undefined;
      void this.#next();
    }
  }
}
