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
import { parseProject } from "../schema/project.ts";
import { createApp } from "./app.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const NOW = "2026-11-20T10:00:00.000Z";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-projects-"));
  app = createApp({ projectsDir, now: () => new Date(NOW), tts: fakeTts().tts });
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
