import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerEvent } from "../schema/api.ts";
import type { ChatMessage } from "../schema/chat.ts";
import { orThrow } from "../schema/errors.ts";
import type { FixOffer } from "../schema/fixes.ts";
import { parseGraph } from "../schema/graph.ts";
import { appendChat, readChat } from "./chat.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { fixRoutes } from "./fix-routes.ts";
import { laidOut } from "./graphs.ts";

const NOW = "2026-11-25T12:00:00.000Z";

let projectsDir: string;
let app: Hono;
let published: ServerEvent[];
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-fixes-"));
  copyExample(projectsDir, "oauth");
  const events = createEvents();
  published = [];
  events.subscribe((event) => published.push(event));
  app = new Hono();
  fixRoutes(app, { projectsDir, now: () => new Date(NOW), events });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const dir = () => join(projectsDir, "oauth");
const read = (name: string) => JSON.parse(readFileSync(join(dir(), name), "utf8"));
const post = (path: string) => app.request(`/api/projects/oauth/fixes/${path}`, { method: "POST" });
const firstCaption = () => read("storyboard.json").scenes[0].beats[0].caption;
const chat = async () => (await readChat(dir())).messages;

/** The checks' message in the chat, offering one fix to the first beat's caption. */
const offer = async (): Promise<FixOffer> => {
  const before = firstCaption();
  const fix: FixOffer = {
    id: "fix-1",
    label: 'Shorten the caption of beat "start"',
    fix: { kind: "words", beat: "start", field: "caption", before, after: "A user signs in." },
  };
  const message: ChatMessage = {
    role: "assistant",
    kind: "checks",
    text: 'The caption of beat "start" goes by too fast to read.',
    at: NOW,
    gate: "script",
    fixes: [fix],
  };
  await appendChat(dir(), [message]);
  return fix;
};

describe("POST /api/projects/:slug/fixes/:id", () => {
  it("applies a fix offered in the chat, says so there, and tells the pages", async () => {
    await offer();
    const response = await post("fix-1");
    expect(response.status).toBe(200);
    expect(firstCaption()).toBe("A user signs in.");
    expect((await chat()).at(-1)).toMatchObject({
      role: "assistant",
      kind: "fix",
      fix: { id: "fix-1", done: "applied" },
    });
    expect(published).toEqual(
      expect.arrayContaining([
        { type: "project-updated", slug: "oauth" },
        { type: "chat", slug: "oauth" },
      ]),
    );
  });

  it("undoes it, putting the words back", async () => {
    const { fix } = await offer();
    await post("fix-1");
    const response = await post("fix-1/undo");
    expect(response.status).toBe(200);
    expect(fix.kind === "words" && firstCaption()).toBe(fix.kind === "words" && fix.before);
    expect((await chat()).at(-1)).toMatchObject({
      kind: "fix",
      fix: { id: "fix-1", done: "undone" },
    });
  });

  it("refuses to apply it twice, or to undo what was not applied", async () => {
    await offer();
    expect((await post("fix-1/undo")).status).toBe(409);
    await post("fix-1");
    expect((await post("fix-1")).status).toBe(409);
  });

  it("refuses to undo once the words were changed since, and changes nothing", async () => {
    await offer();
    await post("fix-1");
    const storyboard = read("storyboard.json");
    storyboard.scenes[0].beats[0].caption = "The user's own words";
    writeFileSync(join(dir(), "storyboard.json"), JSON.stringify(storyboard));
    const response = await post("fix-1/undo");
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toMatch(/changed since/);
    expect(firstCaption()).toBe("The user's own words");
  });

  it("refuses words that do not fit the script, and changes nothing", async () => {
    const before = firstCaption();
    await appendChat(dir(), [
      {
        role: "assistant",
        kind: "checks",
        text: "Too fast.",
        at: NOW,
        gate: "script",
        fixes: [
          {
            id: "fix-2",
            label: "Shorten",
            fix: { kind: "words", beat: "start", field: "caption", before, after: "x".repeat(200) },
          },
        ],
      },
    ]);
    expect((await post("fix-2")).status).toBe(400);
    expect(firstCaption()).toBe(before);
  });

  it("answers 404 for a fix the chat never offered", async () => {
    expect((await post("fix-9")).status).toBe(404);
  });

  it("lays hand-placed nodes out again, and puts them back on undo", async () => {
    const layout = read("layout.json");
    const node = Object.keys(layout.positions)[0] as string;
    const placed = { x: layout.positions[node].x + 2, y: layout.positions[node].y };
    // Laid out with the node placed by hand, as an agent over MCP can leave it.
    const graph = orThrow(parseGraph(read("graph.json")), "graph.json");
    const placedOut = orThrow(
      await laidOut(graph, { ...layout, overrides: { [node]: placed } }),
      "layout",
    );
    writeFileSync(join(dir(), "layout.json"), JSON.stringify(placedOut));
    await appendChat(dir(), [
      {
        role: "assistant",
        kind: "checks",
        text: "Overlap.",
        at: NOW,
        gate: "preview",
        fixes: [
          {
            id: "fix-3",
            label: "Lay out",
            fix: { kind: "layout", before: { [node]: placed }, after: {} },
          },
        ],
      },
    ]);
    expect((await post("fix-3")).status).toBe(200);
    expect(read("layout.json").overrides).toEqual({});
    expect((await post("fix-3/undo")).status).toBe(200);
    expect(read("layout.json").overrides).toEqual({ [node]: placed });
    expect(read("layout.json").positions[node]).toEqual(placed);
  });
});
