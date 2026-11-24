import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { layoutGraph } from "../layout/layout.ts";
import type { LlmClient } from "../llm/client.ts";
import { fakeLlm } from "../llm/fake-llm.testing.ts";
import { graphToMermaid } from "../mermaid/generate.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseProject } from "../schema/project.ts";
import { createApp } from "./app.ts";
import { settingsStore } from "./settings.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const NOW = "2026-11-20T10:00:00.000Z";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-projects-"));
  app = createApp({
    projectsDir,
    now: () => new Date(NOW),
    tts: fakeTts().tts,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const create = (body: unknown) =>
  app.request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** The oauth-login example, copied in under `slug` without its rendered output. */
const copyExample = (slug: string) =>
  cpSync(example, join(projectsDir, slug), {
    recursive: true,
    filter: (source) => !source.includes("/out"),
  });

describe("POST /api/projects", () => {
  it("creates a project folder at the graph gate, named by a slug of its name", async () => {
    const response = await create({ name: "OAuth login" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      slug: "oauth-login",
      project: {
        version: 1,
        name: "OAuth login",
        gate: "graph",
        staleBeats: [],
        origin: "web",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    const written = JSON.parse(
      readFileSync(join(projectsDir, "oauth-login", "project.json"), "utf8"),
    );
    expect(parseProject(written)).toEqual({ ok: true, value: body.project });
  });

  it("passes over a file that has the slug's name", async () => {
    writeFileSync(join(projectsDir, "oauth-login"), "");
    const body = await (await create({ name: "OAuth login" })).json();
    expect(body.slug).toBe("oauth-login-2");
  }, 2_000);

  it("gives a second project of the same name its own folder", async () => {
    await create({ name: "OAuth login" });
    const second = await (await create({ name: "OAuth login" })).json();
    expect(second.slug).toBe("oauth-login-2");
    expect(existsSync(join(projectsDir, "oauth-login-2", "project.json"))).toBe(true);
  });

  it("names what is wrong with the request", async () => {
    const empty = await create({ name: "" });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      errors: [{ path: "name", message: "must not be empty" }],
    });
    const long = await create({ name: "n".repeat(81), extra: true });
    expect((await long.json()).errors).toEqual([
      { path: "name", message: "81 characters, max 80" },
      { path: "extra", message: "unknown key" },
    ]);
    const broken = await create("{name:");
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({
      errors: [{ path: "(body)", message: "not valid JSON" }],
    });
  });
});

describe("GET /api/projects", () => {
  it("lists the projects, the most recently updated first", async () => {
    copyExample("oauth-example");
    await create({ name: "Checkout" });
    const response = await app.request("/api/projects");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [
        { slug: "checkout", name: "Checkout", gate: "graph", origin: "web", updatedAt: NOW },
        {
          slug: "oauth-example",
          name: "OAuth login",
          gate: "render",
          origin: "web",
          updatedAt: "2026-11-19T12:00:00.000Z",
        },
      ],
      broken: [],
    });
  });

  it("lists folders it cannot read as broken, with what is wrong", async () => {
    mkdirSync(join(projectsDir, "no-project-file"));
    writeFileSync(join(projectsDir, "no-project-file", "notes.txt"), "");
    mkdirSync(join(projectsDir, "bad-project"));
    writeFileSync(join(projectsDir, "bad-project", "project.json"), JSON.stringify({ version: 1 }));
    const body = await (await app.request("/api/projects")).json();
    expect(body.projects).toEqual([]);
    expect(body.broken).toEqual([
      {
        slug: "bad-project",
        errors: expect.arrayContaining([{ path: "project.json: name", message: "required" }]),
      },
      { slug: "no-project-file", errors: [{ path: "project.json", message: "missing" }] },
    ]);
  });

  it("leaves out an empty folder, such as one a crash left half made", async () => {
    mkdirSync(join(projectsDir, "half-made"));
    expect(await (await app.request("/api/projects")).json()).toEqual({ projects: [], broken: [] });
  });

  it("is empty when the projects folder does not exist yet", async () => {
    rmSync(projectsDir, { recursive: true });
    expect(await (await app.request("/api/projects")).json()).toEqual({ projects: [], broken: [] });
  });
});

describe("GET /api/projects/:slug", () => {
  it("opens a project with each of its files validated", async () => {
    copyExample("oauth-example");
    const response = await app.request("/api/projects/oauth-example");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slug).toBe("oauth-example");
    expect(body.project.name).toBe("OAuth login");
    expect(body.graph.title).toBeTruthy();
    expect(body.storyboard.scenes.map((s: { id: string }) => s.id)).toEqual([
      "sign_in",
      "exchange",
    ]);
    expect(Object.keys(body.layout.positions)).toContain("user");
    expect(body.config.cards.title.title).toBe("Signing in with OAuth");
  });

  it("gives the files a new project does not have yet as null", async () => {
    await create({ name: "Checkout" });
    const body = await (await app.request("/api/projects/checkout")).json();
    expect(body).toMatchObject({
      slug: "checkout",
      graph: null,
      storyboard: null,
      layout: null,
      config: null,
    });
  });

  it("still opens a project with a broken file, naming the file and field", async () => {
    copyExample("oauth-example");
    writeFileSync(
      join(projectsDir, "oauth-example", "storyboard.json"),
      JSON.stringify({ version: 1, scenes: [] }),
    );
    const response = await app.request("/api/projects/oauth-example");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.project.name).toBe("OAuth login");
    expect(body.graph).not.toBeNull();
    expect(body.storyboard).toBeNull();
    expect(body.problems).toEqual([{ path: "storyboard.json: scenes", message: "0 items, min 1" }]);
  });

  it("cannot open a project whose project.json is broken", async () => {
    copyExample("oauth-example");
    writeFileSync(join(projectsDir, "oauth-example", "project.json"), "{");
    const response = await app.request("/api/projects/oauth-example");
    expect(response.status).toBe(422);
    expect((await response.json()).errors[0].path).toBe("project.json");
  });

  it("finds no project outside the projects folder or under a name it could not have", async () => {
    for (const slug of ["missing", "..%2F", "%2E%2E", "Oauth-Example", "a%00b"]) {
      const response = await app.request(`/api/projects/${slug}`);
      expect(response.status, slug).toBe(404);
    }
  });
});

describe("GET /api/events", () => {
  it("tells a listener when a project is created", async () => {
    const controller = new AbortController();
    const response = await app.request("/api/events", { signal: controller.signal });
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("no body");
    const decoder = new TextDecoder();
    let text = "";
    /** Reads until `count` events have arrived; each is "event data". */
    const eventsUntil = async (count: number) => {
      const parse = () =>
        [...text.matchAll(/^event: (.+)\ndata: (.+)$/gm)].map((m) => `${m[1]} ${m[2]}`);
      while (parse().length < count) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return parse();
    };
    // The stream says it is ready once it listens, so nothing created after that is missed.
    expect(await eventsUntil(1)).toEqual(["ready {}"]);
    await create({ name: "OAuth login" });
    expect(await eventsUntil(2)).toEqual([
      "ready {}",
      'project-created {"type":"project-created","slug":"oauth-login"}',
    ]);
    controller.abort();
    await reader.cancel();
  });
});

describe("request safety", () => {
  const post = (headers: Record<string, string>, body = JSON.stringify({ name: "Sneaky" })) =>
    app.request("/api/projects", { method: "POST", headers, body });

  it("takes only JSON, so a plain cross-site form or fetch cannot create a project", async () => {
    const response = await post({ "content-type": "text/plain" });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      errors: [{ path: "content-type", message: "must be application/json" }],
    });
    expect(existsSync(join(projectsDir, "sneaky"))).toBe(false);
  });

  it("refuses a request from another site's page", async () => {
    const response = await post({
      "content-type": "application/json",
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      errors: [{ path: "origin", message: '"https://evil.example" is not this app' }],
    });
    const ours = await post({
      "content-type": "application/json",
      origin: "http://127.0.0.1:3000",
    });
    expect(ours.status).toBe(201);
  });

  it("refuses a request addressed to another host name, as DNS rebinding would send", async () => {
    const response = await app.request("http://evil.example:3000/api/projects");
    expect(response.status).toBe(403);
    expect((await response.json()).errors[0].path).toBe("host");
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])
      expect((await app.request(`http://${host}/api/projects`)).status, host).toBe(200);
  });

  it("refuses a body over 1 MB", async () => {
    const response = await post(
      { "content-type": "application/json" },
      JSON.stringify({ name: "x", padding: "p".repeat(1_100_000) }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).errors[0].path).toBe("(body)");
  });

  it("answers every unknown API path with a JSON error", async () => {
    for (const [method, path] of [
      ["GET", "/api/nope"],
      ["GET", "/api"],
      ["DELETE", "/api/projects"],
    ] as const) {
      const response = await app.request(path, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect((await response.json()).errors[0].path).toBe("url");
    }
  });
});

describe("/api/settings", () => {
  const KEY = "sk-or-v1-0123456789abcdef";
  const put = (body: unknown) =>
    app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("saves the settings to .env and never sends the key back in full", async () => {
    const saved = await put({ baseUrl: "https://api.openai.com/v1", model: "gpt-5", apiKey: KEY });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text)).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      key: { state: "set", hint: "••••cdef" },
    });
    expect(readFileSync(join(projectsDir, ".env"), "utf8")).toContain(`LLM_API_KEY=${KEY}`);
    const read = await app.request("/api/settings");
    expect(await read.text()).toBe(text);
  });

  it("names what is wrong", async () => {
    const response = await put({ baseUrl: "ftp://files.example.com" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: [{ path: "baseUrl", message: "must be a valid url" }],
    });
  });

  it("takes a key only from a page on this machine, where it never crosses a network", async () => {
    const shared = createApp({
      projectsDir,
      now: () => new Date(NOW),
      tts: fakeTts().tts,
      hosts: ["192.168.1.20"],
      settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
    });
    const putTo = (host: string, body: unknown) =>
      shared.request(`http://${host}/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const overNetwork = await putTo("192.168.1.20:3000", { apiKey: KEY });
    expect(overNetwork.status).toBe(403);
    const { errors } = await overNetwork.json();
    expect(errors).toEqual([{ path: "apiKey", message: expect.stringContaining(".env") }]);
    expect(existsSync(join(projectsDir, ".env"))).toBe(false);
    // Nothing secret travels in the other settings, or in removing the key.
    expect((await putTo("192.168.1.20:3000", { model: "gpt-5", apiKey: null })).status).toBe(200);
    expect((await putTo("127.0.0.1:3000", { apiKey: KEY })).status).toBe(200);
  });

  it("takes settings only as JSON from this app's own pages", async () => {
    const form = await app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "model=x",
    });
    expect(form.status).toBe(415);
    const elsewhere = await app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ model: "x" }),
    });
    expect(elsewhere.status).toBe(403);
  });
});

const postJson = (url: string, body: unknown) =>
  app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/projects/:slug/chat", () => {
  /** Reads the chat until the assistant has finished answering. */
  const untilAnswered = async (slug: string, on = app) => {
    for (let i = 0; i < 200; i++) {
      const chat = await (await on.request(`/api/projects/${slug}/chat`)).json();
      if (!chat.working) return chat;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("the assistant never finished");
  };
  const withLlm = (llm: LlmClient) =>
    createApp({
      projectsDir,
      now: () => new Date(NOW),
      tts: fakeTts().tts,
      settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
      llm,
    });

  it("saves the user's message, has the assistant answer it, and keeps both across a restart", async () => {
    await create({ name: "Chatty" });
    app = withLlm(
      fakeLlm([], [{ text: "Which flow should the video explain?", toolCalls: [] }]).client,
    );
    const sent = await postJson("/api/projects/chatty/chat", {
      text: "  Explain OAuth  ",
      gate: "graph",
    });
    expect(sent.status).toBe(201);
    const { messages } = await sent.json();
    expect(messages).toEqual([{ role: "user", text: "Explain OAuth", at: NOW, gate: "graph" }]);
    const answered = await untilAnswered("chatty");
    expect(answered.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
      ["user", "Explain OAuth"],
      ["assistant", "Which flow should the video explain?"],
    ]);

    // A restarted server reads the same folder.
    const restarted = withLlm(fakeLlm([]).client);
    const read = await (await restarted.request("/api/projects/chatty/chat")).json();
    expect(read).toEqual({ ...answered, working: false });
  });

  it("says plainly that there is no LLM until a key is set, and what works instead", async () => {
    await create({ name: "Keyless" });
    await postJson("/api/projects/keyless/chat", { text: "Hello", gate: "graph" });
    const { messages } = await untilAnswered("keyless");
    expect(messages.at(-1).text).toBe(
      "I can't answer yet: no API key for openrouter.ai; add one in Settings. Until then, you can make the video in the panel on the right.",
    );
  });

  it("answers one message at a time", async () => {
    await create({ name: "Busy" });
    let finish: () => void = () => {};
    const slow: LlmClient = {
      generate: async () => ({ ok: true, value: { text: "" } }),
      converse: () =>
        new Promise((done) => {
          finish = () => done({ ok: true, value: { text: "Done.", toolCalls: [] } });
        }),
    };
    app = withLlm(slow);
    expect((await postJson("/api/projects/busy/chat", { text: "One", gate: "graph" })).status).toBe(
      201,
    );
    expect((await (await app.request("/api/projects/busy/chat")).json()).working).toBe(true);
    const second = await postJson("/api/projects/busy/chat", { text: "Two", gate: "graph" });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      errors: [{ path: "chat", message: "the assistant is still answering the last message" }],
    });
    finish();
    expect((await untilAnswered("busy")).messages.map((m: { text: string }) => m.text)).toEqual([
      "One",
      "Done.",
    ]);
  });

  it("starts empty, names a bad message, and refuses an unknown project", async () => {
    await create({ name: "Quiet" });
    expect(await (await app.request("/api/projects/quiet/chat")).json()).toEqual({
      messages: [],
      problems: [],
      working: false,
    });
    const noGate = await postJson("/api/projects/quiet/chat", { text: "hi" });
    expect(noGate.status).toBe(400);
    expect(await noGate.json()).toEqual({
      errors: [
        { path: "gate", message: 'must be one of "graph", "script", "style", "preview", "render"' },
      ],
    });
    const empty = await postJson("/api/projects/quiet/chat", { text: "   ", gate: "graph" });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      errors: [{ path: "text", message: "must not be empty" }],
    });
    expect(
      (await postJson("/api/projects/nobody/chat", { text: "hi", gate: "graph" })).status,
    ).toBe(404);
  });

  it("reads past a broken line and names it", async () => {
    await create({ name: "Broken chat" });
    writeFileSync(join(projectsDir, "broken-chat", "chat.jsonl"), "{oops\n");
    expect(await (await app.request("/api/projects/broken-chat/chat")).json()).toEqual({
      messages: [],
      problems: [{ path: "chat.jsonl line 1", message: "not valid JSON" }],
      working: false,
    });
  });
});

describe("POST /api/projects/:slug/approve", () => {
  /** The example, moved back to the graph gate. */
  const atGraph = () => {
    copyExample("oauth-example");
    const file = join(projectsDir, "oauth-example", "project.json");
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), gate: "graph" }),
    );
  };

  it("moves the project on from the gate it has reached", async () => {
    atGraph();
    const approved = await postJson("/api/projects/oauth-example/approve", { gate: "graph" });
    expect(approved.status).toBe(200);
    expect((await approved.json()).project).toMatchObject({ gate: "script", updatedAt: NOW });
    const saved = parseProject(
      JSON.parse(readFileSync(join(projectsDir, "oauth-example", "project.json"), "utf8")),
    );
    expect(saved.ok && saved.value.gate).toBe("script");
  });

  it("approves only the gate reached, so a second click or an old tab changes nothing", async () => {
    atGraph();
    await postJson("/api/projects/oauth-example/approve", { gate: "graph" });
    const again = await postJson("/api/projects/oauth-example/approve", { gate: "graph" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({
      errors: [{ path: "gate", message: "the project is at the script gate, not graph" }],
    });
  });

  it("needs the gate's file, and there is nothing after render", async () => {
    await create({ name: "Empty" });
    const empty = await postJson("/api/projects/empty/approve", { gate: "graph" });
    expect(empty.status).toBe(409);
    expect(await empty.json()).toEqual({
      errors: [
        { path: "graph.json", message: "missing or broken: make the graph before approving it" },
      ],
    });
    copyExample("finished");
    const last = await postJson("/api/projects/finished/approve", { gate: "render" });
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({
      errors: [{ path: "gate", message: "render is the last gate" }],
    });
    expect((await postJson("/api/projects/nobody/approve", { gate: "graph" })).status).toBe(404);
  });
});

describe("/api/projects/:slug/graph", () => {
  const put = (slug: string, body: unknown) =>
    app.request(`/api/projects/${slug}/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("reads Mermaid without saving it: the graph, and notes on what it leaves out", async () => {
    await create({ name: "Drafting" });
    const read = await postJson("/api/projects/drafting/graph/read", {
      mermaid: "flowchart LR\n  user([User]) --> app[App]\n  style app fill:#f00",
    });
    expect(read.status).toBe(200);
    const body = await read.json();
    expect(body.graph.nodes.map((n: { id: string; kind: string }) => [n.id, n.kind])).toEqual([
      ["user", "actor"],
      ["app", "service"],
    ]);
    expect(body.notes).toEqual(["line 3: style is not kept; colours come from the palette"]);
    expect(existsSync(join(projectsDir, "drafting", "graph.json"))).toBe(false);
  });

  it("names the line Mermaid cannot read", async () => {
    await create({ name: "Broken mermaid" });
    const read = await postJson("/api/projects/broken-mermaid/graph/read", {
      mermaid: "flowchart LR\n  a -->\n",
    });
    expect(read.status).toBe(400);
    expect((await read.json()).errors[0].path).toBe("line 2");
  });

  it("saves a first graph, named after the project, and lays it out", async () => {
    await create({ name: "First graph" });
    const saved = await put("first-graph", {
      mermaid: "flowchart LR\n  user([User]) --> app[App]",
    });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.graph.title).toBe("First graph");
    expect(body.mermaid).toContain('user(["User"])');
    const dir = join(projectsDir, "first-graph");
    const graph = parseGraph(JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")));
    expect(graph.ok && graph.value.nodes.map((n) => n.id)).toEqual(["user", "app"]);
    expect(existsSync(join(dir, "layout.json"))).toBe(true);
  });

  it("keeps what Mermaid cannot say, and marks the beats an edit touches as stale", async () => {
    copyExample("oauth-example");
    const opened = await (await app.request("/api/projects/oauth-example")).json();
    // The example's Mermaid, with the browser renamed.
    const mermaid = graphToMermaid(opened.graph).replace(
      'browser["Browser"]',
      'browser["Web browser"]',
    );
    const saved = await put("oauth-example", { mermaid });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.graph.nodes.find((n: { id: string }) => n.id === "browser")).toMatchObject({
      label: "Web browser",
      icon: opened.graph.nodes.find((n: { id: string }) => n.id === "browser").icon,
    });
    expect(body.staleBeats.length).toBeGreaterThan(0);
    const project = JSON.parse(
      readFileSync(join(projectsDir, "oauth-example", "project.json"), "utf8"),
    );
    expect(project.staleBeats).toEqual(body.staleBeats);
  });

  it("keeps the user's manual positions when it lays the saved graph out again", async () => {
    copyExample("oauth-example");
    const file = join(projectsDir, "oauth-example", "layout.json");
    const layout = JSON.parse(readFileSync(file, "utf8"));
    // The user dragged the browser two grid steps along: laid out as the app would with that.
    const moved = { x: layout.positions.browser.x + 1, y: layout.positions.browser.y };
    const graph = parseGraph(JSON.parse(readFileSync(join(example, "graph.json"), "utf8")));
    if (!graph.ok) throw new Error("the example graph is invalid");
    const dragged = await layoutGraph(graph.value, { browser: moved });
    if (!dragged.ok) throw new Error("the example cannot be laid out");
    writeFileSync(file, JSON.stringify(dragged.value));
    const opened = await (await app.request("/api/projects/oauth-example")).json();
    expect(opened.layout.overrides).toEqual({ browser: moved });
    const saved = await put("oauth-example", {
      mermaid: graphToMermaid(opened.graph).replace('"Photos API"', '"Photo API"'),
    });
    expect(saved.status).toBe(200);
    const after = JSON.parse(readFileSync(file, "utf8"));
    expect(after.overrides).toEqual({ browser: moved });
    expect(after.positions.browser).toEqual(moved);
  });

  it("saves nothing when the Mermaid cannot be read", async () => {
    await create({ name: "Nothing saved" });
    const saved = await put("nothing-saved", { mermaid: "sequenceDiagram\n  a->>b: hi" });
    expect(saved.status).toBe(400);
    expect(existsSync(join(projectsDir, "nothing-saved", "graph.json"))).toBe(false);
    expect((await put("nobody", { mermaid: "flowchart LR\n a-->b" })).status).toBe(404);
  });
});
