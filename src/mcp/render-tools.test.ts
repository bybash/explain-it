import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { type RenderJob, RenderQueue, type RenderRequest } from "../render/queue.ts";
import { createEvents } from "../server/events.ts";
import { createMcpServer } from "./server.ts";

const NOW = "2026-11-20T10:00:00.000Z";
const { $schema: _g, ...graphFile } = graphJson;
const { $schema: _s, ...storyboardFile } = storyboardJson;
const preview = (slug: string) => `http://127.0.0.1:3000/#/projects/${slug}`;

let projectsDir: string;
let client: Client;
let requests: RenderRequest[];
/** Renders wait on this; a test that needs a job to stay running holds it shut. */
let gate: Promise<void> = Promise.resolve();
beforeEach(async () => {
  gate = Promise.resolve();
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-render-tools-"));
  requests = [];
  // A renderer that finishes at once, writing nothing: the tools are under test, not the render.
  const renders = new RenderQueue({
    now: () => new Date(NOW),
    newId: () => `job-${requests.length + 1}`,
    run: async (request, { onProgress }) => {
      requests.push(request);
      await gate;
      onProgress({ theme: request.themes[0] ?? "light", done: 1, total: 1 });
      return request.themes.map((theme) => ({
        theme,
        video: join(projectsDir, request.slug, "out", theme, "video.mp4"),
        captions: join(projectsDir, request.slug, "out", theme, "captions.srt"),
        poster: join(projectsDir, request.slug, "out", theme, "poster.png"),
      }));
    },
  });
  const server = createMcpServer({
    projectsDir,
    now: () => new Date(NOW),
    events: createEvents(),
    previewUrl: preview,
    renders,
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});
afterEach(async () => {
  await client.close();
  rmSync(projectsDir, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[]).map((c) => c.text).join("\n");
  return result.isError
    ? { ok: false as const, lines: text.split("\n") }
    : { ok: true as const, body: JSON.parse(text) };
};
const succeeds = async (name: string, args: Record<string, unknown>) => {
  const result = await call(name, args);
  if (!result.ok) throw new Error(`${name} failed:\n${result.lines.join("\n")}`);
  return result.body;
};
const fails = async (name: string, args: Record<string, unknown>) => {
  const result = await call(name, args);
  if (result.ok) throw new Error(`${name} succeeded: ${JSON.stringify(result.body)}`);
  return result.lines;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** A project with a graph and a storyboard, ready to render; or with a graph only. */
const project = async (withStoryboard = true) => {
  const { slug } = await succeeds("create_project", { graph: graphFile });
  if (withStoryboard) await succeeds("set_storyboard", { slug, storyboard: storyboardFile });
  return slug as string;
};

describe("render", () => {
  it("queues a render of a ready project and returns the job and a preview link", async () => {
    const slug = await project();
    const body = await succeeds("render", { slug });
    expect(body.preview).toBe(preview(slug));
    expect(body.job).toMatchObject({
      id: "job-1",
      slug,
      state: expect.stringMatching(/queued|running/),
    });
    await settle();
    expect(requests).toEqual([{ slug, themes: ["light"], resolution: "1080p" }]);
  });

  it("takes the themes and resolution, else the project's config", async () => {
    const slug = await project();
    await succeeds("render", { slug, theme: "both", resolution: "720p" });
    await settle();
    expect(requests[0]).toEqual({ slug, themes: ["light", "dark"], resolution: "720p" });
  });

  it("names what stops a project from rendering, and queues nothing", async () => {
    const slug = await project(false);
    const lines = await fails("render", { slug });
    expect(lines).toContain("storyboard.json: missing");
    expect(lines.at(-1)).toBe(`preview: ${preview(slug)}`);
    expect(await fails("render", { slug, theme: "sepia" })).toEqual(
      expect.arrayContaining(['theme: must be one of "light", "dark", "both"']),
    );
    await settle();
    expect(requests).toEqual([]);
  });
});

describe("render_status and cancel_render", () => {
  it("reads a job's progress, then its files", async () => {
    const slug = await project();
    const { job } = await succeeds("render", { slug });
    await settle();
    const status: RenderJob = await succeeds("render_status", { job: job.id });
    expect(status).toMatchObject({
      state: "done",
      progress: { theme: "light", done: 1, total: 1, percent: 100 },
      outputs: [{ theme: "light", video: join(projectsDir, slug, "out", "light", "video.mp4") }],
    });
  });

  it("names a job that does not exist, or one that cannot be cancelled", async () => {
    expect(await fails("render_status", { job: "nope" })).toEqual(['job: no render job "nope"']);
    const slug = await project();
    const { job } = await succeeds("render", { slug });
    await settle();
    expect(await fails("cancel_render", { job: job.id })).toEqual([
      `job: job "${job.id}" is done; only a queued or running job can be cancelled`,
    ]);
  });

  it("cancels a job that has not started", async () => {
    const slug = await project();
    let release = () => {};
    gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = await succeeds("render", { slug });
    const second = await succeeds("render", { slug });
    const cancelled = await succeeds("cancel_render", { job: second.job.id });
    expect(cancelled.state).toBe("cancelled");
    release();
    await settle();
    expect(requests).toHaveLength(1);
    expect((await succeeds("render_status", { job: first.job.id })).state).toBe("done");
  });
});

describe("check", () => {
  it("reports a ready project, its timing, and what it cannot check yet", async () => {
    const slug = await project();
    const report = await succeeds("check", { slug });
    expect(report).toMatchObject({
      ready: true,
      problems: [],
      staleBeats: [],
      preview: preview(slug),
    });
    expect(report.timing.scenes.map((s: { id: string }) => s.id)).toEqual(["sign_in", "exchange"]);
    expect(report.notChecked.length).toBeGreaterThan(0);
  });

  it("names what is missing or broken", async () => {
    const slug = await project(false);
    expect(await succeeds("check", { slug })).toMatchObject({
      ready: false,
      problems: ["storyboard.json: missing"],
      timing: null,
    });
    writeFileSync(join(projectsDir, slug, "graph.json"), "{");
    const broken = await succeeds("check", { slug });
    expect(broken.ready).toBe(false);
    expect(broken.problems[0]).toMatch(/^graph\.json: not valid JSON/);
  });
});
