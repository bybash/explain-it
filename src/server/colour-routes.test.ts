import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { createApp } from "./app.ts";
import { copyExample } from "./example.testing.ts";
import { settingsStore } from "./settings.ts";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-colours-"));
  copyExample(projectsDir, "oauth");
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-26T10:00:00.000Z"),
    tts: fakeTts().tts,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const putColours = (slug: string, body: unknown) =>
  app.request(`/api/projects/${slug}/colours`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const file = (name: string) => readFileSync(join(projectsDir, "oauth", name), "utf8");

describe("PUT /api/projects/:slug/colours", () => {
  it("changes only the colours in graph.json, and marks no beat stale", async () => {
    const graph = JSON.parse(file("graph.json"));
    const layout = file("layout.json");
    const response = await putColours("oauth", { nodes: { idp: "c3" }, edges: { login: "muted" } });
    expect(response.status).toBe(200);
    const saved = JSON.parse(file("graph.json"));
    expect(saved.nodes.find((n: { id: string }) => n.id === "idp").category).toBe("c3");
    expect(saved.edges.find((e: { id: string }) => e.id === "login").category).toBe("muted");
    expect({ ...saved, nodes: [], edges: [] }).toEqual({ ...graph, nodes: [], edges: [] });
    expect(file("layout.json")).toBe(layout);
    expect(JSON.parse(file("project.json")).staleBeats).toEqual([]);
    expect((await response.json()).graph).toEqual(saved);
  });

  it("names what is wrong and writes nothing", async () => {
    const graph = file("graph.json");
    const response = await putColours("oauth", { nodes: { idp: "pink", ghost: "c1" } });
    expect(response.status).toBe(400);
    const { errors } = await response.json();
    expect(errors.map((e: { path: string }) => e.path)).toEqual(["nodes.idp"]);
    expect(file("graph.json")).toBe(graph);
    const unknown = await putColours("oauth", { nodes: { ghost: "c1" } });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      errors: [{ path: "nodes.ghost", message: 'no node "ghost" in the graph' }],
    });
  });

  it("answers 404 for a project that is not there", async () => {
    expect((await putColours("nope", { nodes: {} })).status).toBe(404);
  });
});
