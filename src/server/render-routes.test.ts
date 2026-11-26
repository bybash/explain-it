import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeMix } from "../audio/fake-mix.testing.ts";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import type { RenderRun } from "../render/queue.ts";
import { RendersViewSchema } from "../schema/api.ts";
import type { RenderManifest, RenderRequest } from "../schema/render.ts";
import { createApp } from "./app.ts";
import { copyExample } from "./example.testing.ts";
import { settingsStore } from "./settings.ts";

const STAMP = "2026-11-23T10-30-00.000Z";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
let asked: RenderRequest[];
let release: () => void;

/** A render that waits until the test lets it finish, then lies on disk as a real one does. */
const heldRender: RenderRun = (request, { signal }) =>
  new Promise((resolve, reject) => {
    asked.push(request);
    signal.addEventListener("abort", () => reject(signal.reason));
    release = () => {
      finishedRender(request.slug);
      resolve([]);
    };
  });

/** A finished render of the example in its out/: one theme, a video of 1000 bytes. */
const finishedRender = (slug: string) => {
  const folder = join(projectsDir, slug, "out", STAMP, "light");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "video.mp4"),
    Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)),
  );
  writeFileSync(join(folder, "captions.srt"), "1\n00:00:00,000 --> 00:00:01,000\nHello\n");
  const manifest: RenderManifest = {
    version: 1,
    createdAt: "2026-11-23T10:30:00.000Z",
    resolution: "720p",
    themes: ["light"],
    seconds: 65,
  };
  writeFileSync(join(projectsDir, slug, "out", STAMP, "render.json"), JSON.stringify(manifest));
};

beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-render-routes-"));
  copyExample(projectsDir, "oauth");
  asked = [];
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-23T10:30:00.000Z"),
    tts: fakeTts().tts,
    renderRun: heldRender,
    missingRenderTools: async () => [],
    // A render starts the checks too (5.8), and they make the voice and the music first: real
    // ones would launch Chrome and mix for seconds in the background, stalling the next test.
    mixSoundtrack: fakeMix().mix,
    runChecks: async () => {
      throw new Error("not checking");
    },
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const post = (path: string, body: unknown = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const view = async () =>
  RendersViewSchema.parse(await (await app.request("/api/projects/oauth/renders")).json());

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the render gate's API", () => {
  it("queues a render with the theme and resolution asked for, and lists it until it is on disk", async () => {
    expect(await view()).toEqual({ jobs: [], renders: [] });
    const started = await post("/api/projects/oauth/renders", {
      theme: "both",
      resolution: "720p",
    });
    expect(started.status).toBe(202);
    await settle();
    expect(asked).toEqual([{ slug: "oauth", theme: "both", resolution: "720p" }]);
    expect((await view()).jobs.map((j) => j.state)).toEqual(["running"]);

    release();
    await settle();
    const after = await view();
    expect(after.jobs.map((j) => j.state)).toEqual(["done"]);
    expect(after.renders.map((r) => r.stamp)).toEqual([STAMP]);
  });

  it("renders with the project's style when nothing is asked for", async () => {
    await post("/api/projects/oauth/renders");
    await settle();
    expect(asked).toEqual([{ slug: "oauth" }]);
  });

  it("cancels the project's running render", async () => {
    const started = await (await post("/api/projects/oauth/renders")).json();
    await settle();
    const cancelled = await post(`/api/projects/oauth/renders/${started.id}/cancel`);
    expect(cancelled.status).toBe(200);
    await settle();
    expect((await view()).jobs.map((j) => j.state)).toEqual(["cancelled"]);
    expect((await post("/api/projects/oauth/renders/nope/cancel")).status).toBe(404);
  });

  it("names what is wrong with a request, or with a project that cannot render", async () => {
    const bad = await post("/api/projects/oauth/renders", { theme: "sepia" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors[0].path).toBe("theme");
    rmSync(join(projectsDir, "oauth", "layout.json"));
    const broken = await post("/api/projects/oauth/renders");
    expect(broken.status).toBe(422);
    expect((await broken.json()).errors[0].path).toContain("layout.json");
    expect((await post("/api/projects/nope/renders")).status).toBe(404);
    expect((await app.request("/api/projects/nope/renders")).status).toBe(404);
  });
});

describe("a render's files", () => {
  const file = (name: string, init?: RequestInit) =>
    app.request(`/api/projects/oauth/renders/${STAMP}/light/${name}`, init);

  it("serves each with its type, and as a download when asked", async () => {
    finishedRender("oauth");
    const video = await file("video.mp4");
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("video/mp4");
    expect(video.headers.get("accept-ranges")).toBe("bytes");
    expect((await video.arrayBuffer()).byteLength).toBe(1000);
    const srt = await file("captions.srt?download=1");
    expect(srt.headers.get("content-disposition")).toBe(
      `attachment; filename="oauth-${STAMP}-light-captions.srt"`,
    );
  });

  it("serves a part of a video, so a player can seek", async () => {
    finishedRender("oauth");
    const part = await file("video.mp4", { headers: { range: "bytes=100-199" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 100-199/1000");
    const bytes = new Uint8Array(await part.arrayBuffer());
    expect([bytes.length, bytes[0], bytes[99]]).toEqual([100, 100, 199]);
    const tail = await file("video.mp4", { headers: { range: "bytes=990-" } });
    expect(tail.headers.get("content-range")).toBe("bytes 990-999/1000");
    const beyond = await file("video.mp4", { headers: { range: "bytes=5000-" } });
    expect(beyond.status).toBe(416);
    writeFileSync(join(projectsDir, "oauth", "out", STAMP, "light", "poster.png"), "");
    const empty = await file("poster.png", { headers: { range: "bytes=0-" } });
    expect([empty.status, (await empty.arrayBuffer()).byteLength]).toEqual([200, 0]);
    expect((await file("captions.srt?download=0")).headers.get("content-disposition")).toBeNull();
    const odd = await file("video.mp4", { headers: { range: "lines=1-2" } });
    expect(odd.status).toBe(200);
    expect((await odd.arrayBuffer()).byteLength).toBe(1000);
  });

  it("serves nothing that is not one of a finished render's files", async () => {
    finishedRender("oauth");
    expect((await file("render.json")).status).toBe(404);
    expect((await file("poster.png")).status).toBe(404);
    expect((await app.request(`/api/projects/oauth/renders/${STAMP}/dark/video.mp4`)).status).toBe(
      404,
    );
    expect(
      (await app.request(`/api/projects/oauth/renders/${STAMP}/light/..%2F..%2Fgraph.json`)).status,
    ).toBe(404);
  });
});
