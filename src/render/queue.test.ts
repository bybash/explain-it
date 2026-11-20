import { describe, expect, it } from "vitest";
import { type RenderJob, RenderQueue, type RenderRun } from "./queue.ts";

/** A renderer the test steps by hand: each run waits until the test finishes or fails it. */
const steppedRenderer = () => {
  const runs: {
    slug: string;
    report: (theme: "light" | "dark", done: number, total: number) => void;
    finish: () => void;
    fail: (message: string) => void;
    signal: AbortSignal;
  }[] = [];
  const run: RenderRun = (request, { onProgress, signal }) =>
    new Promise((resolve, reject) => {
      runs.push({
        slug: request.slug,
        report: (theme, done, total) => onProgress({ theme, done, total }),
        finish: () =>
          resolve([
            {
              theme: "light",
              video: `/out/${request.slug}/video.mp4`,
              captions: `/out/${request.slug}/captions.srt`,
              poster: `/out/${request.slug}/poster.png`,
            },
          ]),
        fail: (message) => reject(new Error(message)),
        signal,
      });
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  return { run, runs };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const request = (slug: string) => ({
  slug,
  themes: ["light" as const],
  resolution: "720p" as const,
});

const setup = () => {
  const renderer = steppedRenderer();
  const changes: RenderJob[] = [];
  let n = 0;
  const queue = new RenderQueue({
    run: renderer.run,
    now: () => new Date("2026-11-20T10:00:00.000Z"),
    newId: () => `job-${++n}`,
    onChange: (job) => changes.push(job),
  });
  return { queue, renderer, changes };
};

describe("RenderQueue", () => {
  it("runs one job at a time, in the order they came", async () => {
    const { queue, renderer } = setup();
    const first = queue.add(request("one"));
    const second = queue.add(request("two"));
    await settle();
    expect(queue.get(first.id)?.state).toBe("running");
    expect(queue.get(second.id)?.state).toBe("queued");
    expect(renderer.runs.map((r) => r.slug)).toEqual(["one"]);
    renderer.runs[0]?.finish();
    await settle();
    expect(queue.get(first.id)?.state).toBe("done");
    expect(queue.get(second.id)?.state).toBe("running");
    expect(renderer.runs.map((r) => r.slug)).toEqual(["one", "two"]);
  });

  it("keeps each job's progress and, once done, its files", async () => {
    const { queue, renderer } = setup();
    const job = queue.add(request("one"));
    await settle();
    renderer.runs[0]?.report("light", 30, 120);
    expect(queue.get(job.id)?.progress).toEqual({
      theme: "light",
      done: 30,
      total: 120,
      percent: 25,
    });
    renderer.runs[0]?.finish();
    await settle();
    expect(queue.get(job.id)).toMatchObject({
      state: "done",
      outputs: [{ theme: "light", video: "/out/one/video.mp4" }],
      startedAt: "2026-11-20T10:00:00.000Z",
      finishedAt: "2026-11-20T10:00:00.000Z",
    });
  });

  it("records a failed job with its error and goes on to the next", async () => {
    const { queue, renderer } = setup();
    const bad = queue.add(request("bad"));
    const good = queue.add(request("good"));
    await settle();
    renderer.runs[0]?.fail("ffmpeg exited with 1");
    await settle();
    expect(queue.get(bad.id)).toMatchObject({ state: "failed", error: "ffmpeg exited with 1" });
    expect(queue.get(good.id)?.state).toBe("running");
  });

  it("cancels a queued job before it starts, and a running one by stopping its render", async () => {
    const { queue, renderer } = setup();
    const running = queue.add(request("one"));
    const waiting = queue.add(request("two"));
    await settle();
    expect(queue.cancel(waiting.id)).toMatchObject({ ok: true, value: { state: "cancelled" } });
    expect(queue.cancel(running.id)).toMatchObject({ ok: true });
    expect(renderer.runs[0]?.signal.aborted).toBe(true);
    await settle();
    expect(queue.get(running.id)?.state).toBe("cancelled");
    expect(renderer.runs.map((r) => r.slug)).toEqual(["one"]);
  });

  it("names a job it cannot cancel", async () => {
    const { queue, renderer } = setup();
    const job = queue.add(request("one"));
    await settle();
    renderer.runs[0]?.finish();
    await settle();
    expect(queue.cancel(job.id)).toEqual({
      ok: false,
      errors: [
        {
          path: "job",
          message: `job "${job.id}" is done; only a queued or running job can be cancelled`,
        },
      ],
    });
    expect(queue.cancel("nope")).toEqual({
      ok: false,
      errors: [{ path: "job", message: 'no render job "nope"' }],
    });
  });

  it("tells a listener every time a job changes", async () => {
    const { queue, renderer, changes } = setup();
    queue.add(request("one"));
    await settle();
    renderer.runs[0]?.report("light", 60, 120);
    renderer.runs[0]?.finish();
    await settle();
    expect(changes.map((j) => j.state)).toEqual(["queued", "running", "running", "done"]);
  });
});
