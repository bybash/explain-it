import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerEvent } from "../schema/api.ts";
import { MAX_HOUSE_RULES } from "../schema/story.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { openProject } from "./projects.ts";
import { storyRoutes } from "./story-routes.ts";

const NOW = "2026-11-24T09:00:00.000Z";
const BRIEF = {
  version: 1,
  audience: "New backend developers",
  takeaway: "Sign-in hands the app a token, never the password.",
  shape: "problem",
  hook: "Why does the app never see your password?",
  notes: "Skip the refresh token.",
};

let projectsDir: string;
let app: Hono;
let published: ServerEvent[];
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-story-"));
  copyExample(projectsDir, "oauth");
  const events = createEvents();
  published = [];
  events.subscribe((event) => published.push(event));
  app = new Hono();
  storyRoutes(app, { projectsDir, now: () => new Date(NOW), events });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const put = (path: string, body: unknown) =>
  app.request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const briefFile = () => join(projectsDir, "oauth", "brief.json");

describe("PUT /api/projects/:slug/brief", () => {
  it("saves the brief, which the opened project then carries, and tells the pages", async () => {
    const response = await put("/api/projects/oauth/brief", BRIEF);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brief: BRIEF });
    expect(JSON.parse(readFileSync(briefFile(), "utf8"))).toEqual(BRIEF);
    const opened = await openProject(projectsDir, "oauth");
    expect(opened?.ok && opened.value.brief).toEqual(BRIEF);
    expect(opened?.ok && opened.value.project.updatedAt).toBe(NOW);
    expect(published).toEqual([{ type: "project-updated", slug: "oauth" }]);
  });

  it("replaces the whole brief, so a field left out is gone", async () => {
    await put("/api/projects/oauth/brief", BRIEF);
    await put("/api/projects/oauth/brief", { version: 1, notes: "Only notes now." });
    expect(JSON.parse(readFileSync(briefFile(), "utf8"))).toEqual({
      version: 1,
      notes: "Only notes now.",
    });
  });

  it("names what is wrong and writes nothing", async () => {
    const response = await put("/api/projects/oauth/brief", { version: 1, shape: "saga" });
    expect(response.status).toBe(400);
    expect((await response.json()).errors[0].path).toBe("shape");
    expect(existsSync(briefFile())).toBe(false);
    expect(published).toEqual([]);
  });

  it("answers 404 for a project that does not exist", async () => {
    const response = await put("/api/projects/nothing/brief", BRIEF);
    expect(response.status).toBe(404);
  });
});

describe("the house rules", () => {
  it("reads as empty before any are written", async () => {
    const response = await app.request("/api/house-rules");
    expect(await response.json()).toEqual({ text: "" });
  });

  it("saves them to house-rules.md in the projects folder, and reads them back", async () => {
    const text = "- No jargon.\n- End with a link to the docs.\n";
    const response = await put("/api/house-rules", { text });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text });
    expect(readFileSync(join(projectsDir, "house-rules.md"), "utf8")).toBe(text);
    expect(await (await app.request("/api/house-rules")).json()).toEqual({ text });
  });

  it("refuses rules over the limit, naming the field, and keeps the old ones", async () => {
    await put("/api/house-rules", { text: "- No jargon." });
    const response = await put("/api/house-rules", { text: "x".repeat(MAX_HOUSE_RULES + 1) });
    expect(response.status).toBe(400);
    expect((await response.json()).errors[0].path).toBe("text");
    expect(readFileSync(join(projectsDir, "house-rules.md"), "utf8")).toBe("- No jargon.");
  });
});
