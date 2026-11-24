import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { generateVoice } from "../audio/voice.ts";
import type { ServerEvent } from "../schema/api.ts";
import { parseConfig } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { storyboardRoutes } from "./storyboard-routes.ts";

const NOW = "2026-11-24T12:00:00.000Z";

let projectsDir: string;
let app: Hono;
let published: ServerEvent[];
const { tts } = fakeTts();
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-script-"));
  copyExample(projectsDir, "oauth");
  const events = createEvents();
  published = [];
  events.subscribe((event) => published.push(event));
  app = new Hono();
  storyboardRoutes(app, { projectsDir, now: () => new Date(NOW), events, tts });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const file = (name: string) => join(projectsDir, "oauth", name);
const read = (name: string) => JSON.parse(readFileSync(file(name), "utf8"));
const put = (slug: string, body: unknown) =>
  app.request(`/api/projects/${slug}/storyboard`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
/** The example's project.json, at a gate and with stale beats of the test's choosing. */
const projectAt = (gate: string, staleBeats: string[]) =>
  writeFileSync(
    file("project.json"),
    JSON.stringify({ ...read("project.json"), gate, staleBeats }),
  );

describe("PUT /api/projects/:slug/storyboard", () => {
  it("saves a storyboard that fits the graph, moves the gate on to the script, and tells the pages", async () => {
    projectAt("graph", []);
    const storyboard = read("storyboard.json");
    storyboard.scenes[0].beats[0].caption = "A new first caption";
    const response = await put("oauth", storyboard);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.staleBeats).toEqual([]);
    expect(read("storyboard.json").scenes[0].beats[0].caption).toBe("A new first caption");
    expect(read("project.json")).toMatchObject({ gate: "script", updatedAt: NOW });
    expect(published).toEqual([{ type: "project-updated", slug: "oauth" }]);
  });

  it("clears a stale beat once it is rewritten, and keeps one left as it was", async () => {
    const storyboard = read("storyboard.json");
    const [first, second] = storyboard.scenes[0].beats;
    projectAt("preview", [first.id, second.id]);
    first.say = "Rewritten after the graph changed.";
    const body = await (await put("oauth", storyboard)).json();
    expect(body.staleBeats).toEqual([second.id]);
    expect(read("project.json")).toMatchObject({ gate: "preview", staleBeats: [second.id] });
  });

  it("names each problem by its place, and writes nothing", async () => {
    const before = readFileSync(file("storyboard.json"), "utf8");
    const storyboard = read("storyboard.json");
    storyboard.scenes[0].beats[1].caption = "";
    storyboard.scenes[0].beats[2].actions = [{ type: "highlight", node: "nowhere" }];
    const response = await put("oauth", storyboard);
    expect(response.status).toBe(400);
    const paths = (await response.json()).errors.map((e: { path: string }) => e.path);
    expect(paths).toContain("scenes[0].beats[1].caption");
    expect(readFileSync(file("storyboard.json"), "utf8")).toBe(before);
    expect(published).toEqual([]);
  });

  it("needs the graph first, and a project that exists", async () => {
    rmSync(file("graph.json"));
    const needsGraph = await put("oauth", read("storyboard.json"));
    expect(needsGraph.status).toBe(409);
    expect((await needsGraph.json()).errors[0].path).toBe("graph.json");
    expect((await put("nothing", {})).status).toBe(404);
  });
});

describe("GET /api/projects/:slug/narration", () => {
  it("gives nothing before the voice is made", async () => {
    const response = await app.request("/api/projects/oauth/narration");
    expect(await response.json()).toEqual({ seconds: {} });
  });

  it("gives each line's measured length once the voice is made, by its words", async () => {
    const storyboard = read("storyboard.json");
    const { voice } = orThrow(parseConfig(read("config.json")), "config.json");
    const lines = await generateVoice({
      projectDir: join(projectsDir, "oauth"),
      storyboard,
      voice,
      tts,
    });
    const body = await (await app.request("/api/projects/oauth/narration")).json();
    const first = storyboard.scenes[0].beats.find((b: { say?: string }) => b.say);
    expect(body.seconds[first.say]).toBe(lines[0]?.seconds);
    expect(Object.keys(body.seconds)).toHaveLength(new Set(lines.map((l) => l.file)).size);
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await app.request("/api/projects/nothing/narration")).status).toBe(404);
  });
});
