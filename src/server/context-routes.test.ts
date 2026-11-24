import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerEvent } from "../schema/api.ts";
import { MAX_CONTEXT_CHARS } from "../schema/context.ts";
import { contextRoutes } from "./context-routes.ts";
import { createEvents } from "./events.ts";
import { makeProject } from "./projects.ts";

let projectsDir: string;
let app: Hono;
let published: ServerEvent[];
beforeEach(async () => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-context-api-"));
  await makeProject(projectsDir, { name: "Login", origin: "web" }, new Date());
  const events = createEvents();
  published = [];
  events.subscribe((e) => published.push(e));
  app = new Hono();
  contextRoutes(app, { projectsDir, events });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const add = (body: unknown, slug = "login") =>
  app.request(`/api/projects/${slug}/context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/projects/:slug/context", () => {
  it("adds, lists and removes context, telling the pages", async () => {
    const added = await add({ name: "spec.md", text: "Users sign in with Google." });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ name: "spec.md", chars: 26 });
    expect(await (await app.request("/api/projects/login/context")).json()).toEqual({
      files: [{ name: "spec.md", chars: 26 }],
      chars: 26,
      max: MAX_CONTEXT_CHARS,
    });
    const removed = await app.request("/api/projects/login/context/spec.md", { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ files: [], chars: 0, max: MAX_CONTEXT_CHARS });
    expect(published.filter((e) => e.type === "project-updated")).toHaveLength(2);
  });

  it("refuses oversized context with a message that says what to do", async () => {
    const response = await add({ name: "huge.md", text: "x".repeat(MAX_CONTEXT_CHARS + 1) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      errors: [
        {
          path: "context",
          message:
            "100,001 characters with huge.md; the most is 100,000. Remove a file or trim one, then add it again.",
        },
      ],
    });
  });

  it("names a bad request, an unknown file and an unknown project", async () => {
    expect((await add({ name: "", text: "x" })).status).toBe(400);
    expect((await add({ name: "a.png", text: "x" })).status).toBe(400);
    const missing = await app.request("/api/projects/login/context/nope.md", { method: "DELETE" });
    expect(missing.status).toBe(404);
    expect((await add({ name: "a.md", text: "x" }, "nobody")).status).toBe(404);
  });
});
